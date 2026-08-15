import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { reschedules, bookings, classes, memberships } from "@/db/schema";
import type { Booking, GymClass } from "@/db/schema";
import { router, protectedProcedure } from "@/server/trpc";
import {
  FREE_RESCHEDULE_HOURS,
  UNLIMITED_CREDITS,
  hoursUntil,
  isClassFull,
  promoteNextWaitlisted,
} from "@/server/routers/booking-rules";

type RescheduleCheck =
  | {
      ok: true;
      originalBooking: Booking;
      originalClass: GymClass;
      targetClass: GymClass;
      targetIsFull: boolean;
    }
  | { ok: false; code: TRPC_ERROR_CODE_KEY; reason: string };

/**
 * All the rules for "can this booking move to this class" in one place.
 * Both the `reschedule` mutation and the `validateReschedule` query used to
 * carry their own copy of this ~120-line chain (one throwing, one returning
 * `{valid, reason}`) - they now both call this and report the result their
 * own way, so the rules themselves can't drift apart.
 */
async function checkReschedule(
  db: typeof import("@/db").db,
  userId: number,
  fromBookingId: number,
  toClassId: number,
): Promise<RescheduleCheck> {
  const originalRow = await db
    .select({ booking: bookings, cls: classes })
    .from(bookings)
    .innerJoin(classes, eq(bookings.classId, classes.id))
    .where(eq(bookings.id, fromBookingId))
    .get();

  if (!originalRow) {
    return { ok: false, code: "NOT_FOUND", reason: "Booking not found." };
  }

  const originalBooking = originalRow.booking;
  const originalClass = originalRow.cls;

  if (originalBooking.userId !== userId) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "You cannot reschedule this booking.",
    };
  }

  if (originalBooking.status !== "booked" && originalBooking.status !== "waitlisted") {
    return {
      ok: false,
      code: "BAD_REQUEST",
      reason: "This booking is no longer active.",
    };
  }

  // Reschedule is allowed up to FREE_RESCHEDULE_HOURS before the original class.
  if (hoursUntil(originalClass.startsAt) < FREE_RESCHEDULE_HOURS) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      reason: `You can only reschedule up to ${FREE_RESCHEDULE_HOURS} hours before the class starts.`,
    };
  }

  const targetClass = await db
    .select()
    .from(classes)
    .where(eq(classes.id, toClassId))
    .get();

  if (!targetClass) {
    return { ok: false, code: "NOT_FOUND", reason: "Target class not found." };
  }

  if (targetClass.name !== originalClass.name) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      reason: "You can only reschedule to a class with the same name.",
    };
  }

  if (targetClass.id === originalClass.id) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      reason: "You are already booked for this class.",
    };
  }

  if (hoursUntil(targetClass.startsAt) <= 0) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      reason: "This class has already started.",
    };
  }

  if (targetClass.cancelled) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      reason: "This class has been cancelled.",
    };
  }

  const existingBooking = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.classId, targetClass.id),
        eq(bookings.userId, userId),
        sql`${bookings.status} in ('booked', 'waitlisted')`,
      ),
    )
    .get();

  if (existingBooking) {
    return {
      ok: false,
      code: "CONFLICT",
      reason: "You already have an active booking for this class.",
    };
  }

  const targetIsFull = await isClassFull(db, targetClass);

  return { ok: true, originalBooking, originalClass, targetClass, targetIsFull };
}

export const reschedulesRouter = router({
  reschedule: protectedProcedure
    .input(
      z.object({
        fromBookingId: z.number(),
        toClassId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const check = await checkReschedule(
        ctx.db,
        ctx.user.id,
        input.fromBookingId,
        input.toClassId,
      );

      if (!check.ok) {
        throw new TRPCError({ code: check.code, message: check.reason });
      }

      const { originalBooking, originalClass, targetClass, targetIsFull } = check;
      const newStatus = targetIsFull ? "waitlisted" : "booked";

      // What the new booking should charge depends on the status it's
      // landing in, not on what the old booking happened to have stored.
      // "Keep what you spent" (the old flat copy of `creditsUsed`) only
      // makes sense between two confirmed spots - a status flip either
      // direction needs its own credit movement:
      //   - booked -> waitlisted: no longer holding a seat, so refund what
      //     was paid instead of leaving it stuck on an unconfirmed booking
      //     (which used to get charged *again* once promoteNextWaitlisted
      //     ran, since that function assumes a waitlisted booking always
      //     starts at 0 credits).
      //   - waitlisted -> booked: was never charged in the first place, so
      //     charge for the confirmed spot now, same as booking it fresh.
      let newCreditsUsed = originalBooking.creditsUsed;
      const membership = originalBooking.membershipId
        ? await ctx.db
            .select()
            .from(memberships)
            .where(eq(memberships.id, originalBooking.membershipId))
            .get()
        : undefined;
      const unlimited = !!membership && membership.creditsRemaining >= UNLIMITED_CREDITS;

      if (newStatus === "waitlisted") {
        newCreditsUsed = 0;
        if (
          originalBooking.status === "booked" &&
          originalBooking.creditsUsed > 0 &&
          membership &&
          !unlimited
        ) {
          await ctx.db
            .update(memberships)
            .set({ creditsRemaining: membership.creditsRemaining + originalBooking.creditsUsed })
            .where(eq(memberships.id, membership.id));
        }
      } else if (originalBooking.status === "waitlisted") {
        if (!membership) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No membership on file for this booking.",
          });
        }
        if (!unlimited && membership.creditsRemaining < targetClass.creditCost) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Not enough class credits remaining.",
          });
        }
        newCreditsUsed = targetClass.creditCost;
        if (!unlimited) {
          await ctx.db
            .update(memberships)
            .set({ creditsRemaining: membership.creditsRemaining - targetClass.creditCost })
            .where(eq(memberships.id, membership.id));
        }
      }
      // booked -> booked: unchanged, they keep what they already paid.

      const newBooking = await ctx.db
        .insert(bookings)
        .values({
          classId: targetClass.id,
          userId: ctx.user.id,
          membershipId: originalBooking.membershipId,
          status: newStatus,
          creditsUsed: newCreditsUsed,
        })
        .returning()
        .get();

      // Cancel the original booking. Any credits it used have already been
      // accounted for above - refunded if the new spot isn't confirmed, or
      // carried over as-is if it is.
      await ctx.db
        .update(bookings)
        .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
        .where(eq(bookings.id, originalBooking.id));

      // If the original booking held a confirmed spot, freeing it should
      // promote the next waitlisted member for that class - same as a
      // plain cancellation would.
      if (originalBooking.status === "booked") {
        await promoteNextWaitlisted(ctx.db, originalClass);
      }

      await ctx.db.insert(reschedules).values({
        userId: ctx.user.id,
        fromBookingId: originalBooking.id,
        toBookingId: newBooking.id,
        fromClassId: originalClass.id,
        toClassId: targetClass.id,
      });

      return {
        ok: true,
        newBooking,
        newStatus,
      };
    }),

  history: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: reschedules.id,
        rescheduledAt: reschedules.rescheduledAt,
        fromClassName: classes.name,
        fromClassTime: sql<string>`(
          SELECT ${classes.startsAt} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.fromClassId}
        )`,
        fromClassRoom: sql<string>`(
          SELECT ${classes.room} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.fromClassId}
        )`,
        toClassName: sql<string>`(
          SELECT ${classes.name} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.toClassId}
        )`,
        toClassTime: sql<string>`(
          SELECT ${classes.startsAt} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.toClassId}
        )`,
        toClassRoom: sql<string>`(
          SELECT ${classes.room} FROM ${classes}
          WHERE ${classes.id} = ${reschedules.toClassId}
        )`,
      })
      .from(reschedules)
      .innerJoin(classes, eq(reschedules.fromClassId, classes.id))
      .where(eq(reschedules.userId, ctx.user.id))
      .orderBy(desc(reschedules.rescheduledAt));
  }),

  validateReschedule: protectedProcedure
    .input(
      z.object({
        fromBookingId: z.number(),
        toClassId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const check = await checkReschedule(
        ctx.db,
        ctx.user.id,
        input.fromBookingId,
        input.toClassId,
      );

      if (!check.ok) {
        return { valid: false, reason: check.reason };
      }

      return { valid: true, targetIsFull: check.targetIsFull };
    }),
});
