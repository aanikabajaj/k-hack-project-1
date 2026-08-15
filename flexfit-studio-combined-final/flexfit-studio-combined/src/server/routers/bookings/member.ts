/**
 * Booking actions a member takes on their own behalf: see my bookings,
 * book a class, cancel a booking, check my waitlist position.
 *
 * Staff-facing booking actions (roster, check-in, etc.) live in `./staff.ts`.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { bookings, classes, memberships } from "@/db/schema";
import { protectedProcedure } from "@/server/trpc";
import {
  activeMembershipFor,
  hoursUntil,
  isClassFull,
  promoteNextWaitlisted,
  refundIfEligible,
  UNLIMITED_CREDITS,
} from "@/server/routers/booking-rules";

export const memberBookingProcedures = {
  mine: protectedProcedure
    .input(z.object({ includePast: z.boolean().default(false) }).default({}))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: bookings.id,
          status: bookings.status,
          creditsUsed: bookings.creditsUsed,
          bookedAt: bookings.bookedAt,
          classId: classes.id,
          className: classes.name,
          room: classes.room,
          startsAt: classes.startsAt,
          durationMin: classes.durationMin,
          cancelled: classes.cancelled,
        })
        .from(bookings)
        .innerJoin(classes, eq(bookings.classId, classes.id))
        .where(eq(bookings.userId, ctx.user.id))
        .orderBy(asc(classes.startsAt));

      const now = new Date();
      return rows.filter((r) =>
        input.includePast ? true : new Date(r.startsAt) >= now,
      );
    }),

  book: protectedProcedure
    .input(z.object({ classId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Everything below runs inside one transaction: the capacity check
      // and the insert it decides ("booked" vs "waitlisted") both read and
      // write in the same round trip, so two members booking the last spot
      // at the same time can't both read "not full" and both land as
      // "booked". SQLite serializes writers around this transaction the
      // same way it would around a single statement.
      return ctx.db.transaction(async (tx) => {
        const cls = await tx
          .select()
          .from(classes)
          .where(eq(classes.id, input.classId))
          .get();

        if (!cls) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
        }
        if (cls.cancelled) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This class has been cancelled.",
          });
        }
        if (hoursUntil(cls.startsAt) <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This class has already started.",
          });
        }

        const existing = await tx
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.classId, cls.id),
              eq(bookings.userId, ctx.user.id),
              inArray(bookings.status, ["booked", "waitlisted"]),
            ),
          )
          .get();

        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You are already on the list for this class.",
          });
        }

        const membership = await activeMembershipFor(tx, ctx.user.id);
        if (!membership) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "An active membership is required to book classes.",
          });
        }

        const unlimited = membership.creditsRemaining >= UNLIMITED_CREDITS;
        const isFull = await isClassFull(tx, cls);

        // Joining a waitlist never charges credits (see `creditsUsed` below),
        // so it shouldn't require having any - only a confirmed spot needs
        // credit to cover it.
        if (!isFull && !unlimited && membership.creditsRemaining < cls.creditCost) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Not enough class credits remaining.",
          });
        }

        const created = await tx
          .insert(bookings)
          .values({
            classId: cls.id,
            userId: ctx.user.id,
            membershipId: membership.id,
            status: isFull ? "waitlisted" : "booked",
            creditsUsed: isFull ? 0 : cls.creditCost,
          })
          .returning()
          .get();

        if (!isFull && !unlimited) {
          await tx
            .update(memberships)
            .set({ creditsRemaining: membership.creditsRemaining - cls.creditCost })
            .where(eq(memberships.id, membership.id));
        }

        return created;
      });
    }),

  cancel: protectedProcedure
    .input(z.object({ bookingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // One transaction for "cancel the seat, refund it, promote whoever's
      // next" - otherwise a crash or concurrent request between the cancel
      // and the promotion could free a seat without anyone actually being
      // promoted into it.
      return ctx.db.transaction(async (tx) => {
        const row = await tx
          .select({ booking: bookings, cls: classes })
          .from(bookings)
          .innerJoin(classes, eq(bookings.classId, classes.id))
          .where(eq(bookings.id, input.bookingId))
          .get();

        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
        }

        const isOwner = row.booking.userId === ctx.user.id;
        const isStaff = ctx.user.role === "admin" || ctx.user.role === "trainer";
        if (!isOwner && !isStaff) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You cannot cancel this booking.",
          });
        }

        if (row.booking.status !== "booked" && row.booking.status !== "waitlisted") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This booking is no longer active.",
          });
        }

        const wasBooked = row.booking.status === "booked";

        await tx
          .update(bookings)
          .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
          .where(eq(bookings.id, row.booking.id));

        const refunded = await refundIfEligible(tx, row.booking, row.cls);

        // Freeing a confirmed spot promotes the member who has waited longest.
        if (wasBooked) {
          await promoteNextWaitlisted(tx, row.cls);
        }

        return { ok: true, refunded };
      });
    }),

  waitlisted: protectedProcedure.query(async ({ ctx }) => {
    const waitlistedBookings = await ctx.db
      .select({
        bookingId: bookings.id,
        classId: classes.id,
        className: classes.name,
        room: classes.room,
        startsAt: classes.startsAt,
        durationMin: classes.durationMin,
        capacity: classes.capacity,
        bookedAt: bookings.bookedAt,
      })
      .from(bookings)
      .innerJoin(classes, eq(bookings.classId, classes.id))
      .where(
        and(
          eq(bookings.userId, ctx.user.id),
          eq(bookings.status, "waitlisted"),
        ),
      )
      .orderBy(asc(classes.startsAt));

    // For each waitlisted booking, calculate position in queue
    return Promise.all(
      waitlistedBookings.map(async (wb) => {
        const [{ position }] = await ctx.db
          .select({ position: sql<number>`count(*)` })
          .from(bookings)
          .where(
            and(
              eq(bookings.classId, wb.classId),
              eq(bookings.status, "waitlisted"),
              sql`${bookings.bookedAt} < ${wb.bookedAt}`,
            ),
          );

        return {
          ...wb,
          position: Number(position) + 1, // +1 because we're counting those before us
        };
      }),
    );
  }),
} as const;
