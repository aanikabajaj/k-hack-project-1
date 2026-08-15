import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { corporateBookings, classes, companies, companyMembers, checkins, users } from "@/db/schema";

type Db = typeof import("@/db").db;

export const CORPORATE_FREE_CANCELLATION_HOURS = 24;

function hoursUntil(iso: string, now = new Date()): number {
  return (new Date(iso).getTime() - now.getTime()) / 36e5;
}

async function getCompanyForMember(db: Db, userId: number) {
  return db.select().from(companyMembers).innerJoin(companies, eq(companyMembers.companyId, companies.id)).where(and(eq(companyMembers.userId, userId), eq(companies.active, true))).get();
}

export async function listMine(db: Db, userId: number, includePast: boolean) {
  const rows = await db.select({ id: corporateBookings.id, status: corporateBookings.status, creditsUsed: corporateBookings.creditsUsed, bookedAt: corporateBookings.bookedAt, classId: classes.id, className: classes.name, room: classes.room, startsAt: classes.startsAt, durationMin: classes.durationMin, cancelled: classes.cancelled, companyName: companies.name }).from(corporateBookings).innerJoin(classes, eq(corporateBookings.classId, classes.id)).innerJoin(companies, eq(corporateBookings.companyId, companies.id)).where(eq(corporateBookings.userId, userId)).orderBy(asc(classes.startsAt));
  const now = new Date();
  return rows.filter((r) => includePast ? true : new Date(r.startsAt) >= now);
}

export async function book(db: Db, userId: number, classId: number) {
  const cls = await db.select().from(classes).where(eq(classes.id, classId)).get();
  if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
  if (cls.cancelled) throw new TRPCError({ code: "BAD_REQUEST", message: "This class has been cancelled." });
  if (hoursUntil(cls.startsAt) <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "This class has already started." });

  const existing = await db.select().from(corporateBookings).where(and(eq(corporateBookings.classId, cls.id), eq(corporateBookings.userId, userId), inArray(corporateBookings.status, ["booked", "waitlisted"]))).get();
  if (existing) throw new TRPCError({ code: "CONFLICT", message: "You are already on the list for this class." });

  const companyRow = await getCompanyForMember(db, userId);
  if (!companyRow) throw new TRPCError({ code: "FORBIDDEN", message: "You are not linked to an active company." });
  const company = companyRow.companies;
  if (company.creditPoolBalance < cls.creditCost) throw new TRPCError({ code: "FORBIDDEN", message: "Your company does not have enough credits." });

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(corporateBookings).where(and(eq(corporateBookings.classId, cls.id), eq(corporateBookings.status, "booked")));
  const isFull = Number(count) >= cls.capacity;
  const created = await db.insert(corporateBookings).values({ classId: cls.id, userId, companyId: company.id, status: isFull ? "waitlisted" : "booked", creditsUsed: isFull ? 0 : cls.creditCost }).returning().get();
  if (!isFull) await db.update(companies).set({ creditPoolBalance: company.creditPoolBalance - cls.creditCost }).where(eq(companies.id, company.id));
  return created;
}

export async function cancel(db: Db, userId: number, role: string, bookingId: number) {
  const row = await db.select({ booking: corporateBookings, cls: classes }).from(corporateBookings).innerJoin(classes, eq(corporateBookings.classId, classes.id)).where(eq(corporateBookings.id, bookingId)).get();
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  const isOwner = row.booking.userId === userId;
  const isStaff = role === "admin" || role === "trainer";
  if (!isOwner && !isStaff) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot cancel this booking." });
  if (row.booking.status !== "booked" && row.booking.status !== "waitlisted") throw new TRPCError({ code: "BAD_REQUEST", message: "This booking is no longer active." });

  const refundable = hoursUntil(row.cls.startsAt) >= CORPORATE_FREE_CANCELLATION_HOURS && row.booking.creditsUsed > 0;
  await db.update(corporateBookings).set({ status: "cancelled", cancelledAt: new Date().toISOString() }).where(eq(corporateBookings.id, row.booking.id));

  if (refundable) {
    const company = await db.select().from(companies).where(eq(companies.id, row.booking.companyId)).get();
    if (company) await db.update(companies).set({ creditPoolBalance: company.creditPoolBalance + row.booking.creditsUsed }).where(eq(companies.id, company.id));
  }

  if (row.booking.status === "booked") {
    const next = await db.select().from(corporateBookings).where(and(eq(corporateBookings.classId, row.cls.id), eq(corporateBookings.status, "waitlisted"))).orderBy(asc(corporateBookings.bookedAt)).get();
    if (next) {
      await db.update(corporateBookings).set({ status: "booked", creditsUsed: row.cls.creditCost }).where(eq(corporateBookings.id, next.id));
      const company = await db.select().from(companies).where(eq(companies.id, next.companyId)).get();
      if (company && company.creditPoolBalance >= row.cls.creditCost) {
        await db.update(companies).set({ creditPoolBalance: Math.max(0, company.creditPoolBalance - row.cls.creditCost) }).where(eq(companies.id, company.id));
      }
    }
  }
  return { ok: true, refunded: refundable };
}

export async function markAttended(db: Db, bookingId: number) {
  const booking = await db.select().from(corporateBookings).where(eq(corporateBookings.id, bookingId)).get();
  if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  if (booking.status !== "booked") throw new TRPCError({ code: "BAD_REQUEST", message: "Only confirmed bookings can be checked in." });
  await db.update(corporateBookings).set({ status: "attended" }).where(eq(corporateBookings.id, booking.id));
  await db.insert(checkins).values({ userId: booking.userId, bookingId: null });
  return { ok: true };
}

export async function rosterFor(db: Db, classId: number) {
  return db.select({ bookingId: corporateBookings.id, status: corporateBookings.status, memberId: users.id, memberName: users.name, memberEmail: users.email, bookedAt: corporateBookings.bookedAt, companyName: companies.name }).from(corporateBookings).innerJoin(users, eq(corporateBookings.userId, users.id)).innerJoin(companies, eq(corporateBookings.companyId, companies.id)).where(eq(corporateBookings.classId, classId)).orderBy(asc(corporateBookings.bookedAt));
}
