/**
 * Shared rules for booking, cancelling, and rescheduling classes.
 *
 * This file exists so `bookings/*` and `reschedules.ts` don't each carry
 * their own copy of "what counts as an active membership" or "how do we
 * refund a cancelled booking". Before this file existed, both routers
 * defined identical `hoursUntil` / `activeMembershipFor` helpers, and the
 * waitlist-promotion + refund logic was duplicated inline. Same behavior,
 * one place to read it.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { bookings, memberships, notifications } from "@/db/schema";
import type { Booking, GymClass } from "@/db/schema";
import type { db as Db } from "@/db";
import { UNLIMITED_CREDITS } from "@/lib/constants";

/**
 * Members may cancel free of charge up to this many hours before the class
 * starts. Cancelling later still frees the spot but forfeits the credit.
 */
export const FREE_CANCELLATION_HOURS = 12;

/**
 * Members may reschedule free of charge up to this many hours before the
 * original class starts. This is more generous than the cancellation policy.
 */
export const FREE_RESCHEDULE_HOURS = 4;

export { UNLIMITED_CREDITS };

export function hoursUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 36e5;
}

/** A user's current membership, if they have one that hasn't expired. */
export async function activeMembershipFor(db: typeof Db, userId: number) {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.status, "active"),
        sql`${memberships.endDate} >= ${today}`,
      ),
    )
    .orderBy(desc(memberships.endDate))
    .get();
}

/** How many "booked" (not waitlisted, not cancelled) seats a class has taken. */
export async function bookedCount(db: typeof Db, classId: number): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(and(eq(bookings.classId, classId), eq(bookings.status, "booked")));

  return Number(count);
}

export async function isClassFull(db: typeof Db, cls: Pick<GymClass, "id" | "capacity">) {
  return (await bookedCount(db, cls.id)) >= cls.capacity;
}

/**
 * Refunds a cancelled booking's credits back to its membership, if the
 * cancellation happened early enough and credits were actually spent.
 * Unlimited-credit memberships are never touched. Returns whether a refund
 * happened, so callers can report it back to the member.
 */
export async function refundIfEligible(
  db: typeof Db,
  booking: Pick<Booking, "creditsUsed" | "membershipId">,
  cls: Pick<GymClass, "startsAt">,
): Promise<boolean> {
  const refundable =
    hoursUntil(cls.startsAt) >= FREE_CANCELLATION_HOURS && booking.creditsUsed > 0;

  if (!refundable || !booking.membershipId) return false;

  const ms = await db
    .select()
    .from(memberships)
    .where(eq(memberships.id, booking.membershipId))
    .get();

  if (ms && ms.creditsRemaining < UNLIMITED_CREDITS) {
    await db
      .update(memberships)
      .set({ creditsRemaining: ms.creditsRemaining + booking.creditsUsed })
      .where(eq(memberships.id, ms.id));
  }

  return refundable;
}

/**
 * Freeing a confirmed ("booked") spot promotes whoever has waited longest
 * for that class from "waitlisted" to "booked", charges them the class's
 * credit cost, and notifies them.
 *
 * Call this whenever a "booked" booking stops being booked - both a
 * straight cancellation and a reschedule away from a booked class need to
 * free the spot for the next person in line the same way.
 */
export async function promoteNextWaitlisted(
  db: typeof Db,
  cls: Pick<GymClass, "id" | "name" | "creditCost">,
) {
  const next = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.classId, cls.id), eq(bookings.status, "waitlisted")))
    .orderBy(asc(bookings.bookedAt))
    .get();

  if (!next) return null;

  await db
    .update(bookings)
    .set({ status: "booked", creditsUsed: cls.creditCost })
    .where(eq(bookings.id, next.id));

  if (next.membershipId) {
    const ms = await db
      .select()
      .from(memberships)
      .where(eq(memberships.id, next.membershipId))
      .get();

    if (ms && ms.creditsRemaining < UNLIMITED_CREDITS) {
      await db
        .update(memberships)
        .set({ creditsRemaining: Math.max(0, ms.creditsRemaining - cls.creditCost) })
        .where(eq(memberships.id, ms.id));
    }
  }

  await db.insert(notifications).values({
    userId: next.userId,
    type: "waitlist_promotion",
    title: "You're off the waitlist",
    message: `A spot opened up in ${cls.name} and you've been moved from the waitlist to a confirmed booking.`,
  });

  return next;
}
