import { and, eq, gte, sql, lte, inArray } from "drizzle-orm";
import {
  users,
  memberships,
  classes,
  bookings,
  payments,
  checkins,
  membershipPlans,
} from "@/db/schema";

type Db = typeof import("@/db").db;

export async function getAdminStats(db: Db) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const [{ totalMembers }] = await db.select({ totalMembers: sql<number>`count(*)` }).from(users).where(eq(users.role, "member"));
  const [{ activeMemberships }] = await db.select({ activeMemberships: sql<number>`count(*)` }).from(memberships).where(and(eq(memberships.status, "active"), sql`${memberships.endDate} >= ${today}`));
  const [{ upcomingClasses }] = await db.select({ upcomingClasses: sql<number>`count(*)` }).from(classes).where(and(gte(classes.startsAt, now), eq(classes.cancelled, false)));
  const [{ revenueCents }] = await db.select({ revenueCents: sql<number>`coalesce(sum(amount_cents), 0)` }).from(payments).where(eq(payments.status, "paid"));
  const [{ totalCheckins }] = await db.select({ totalCheckins: sql<number>`count(*)` }).from(checkins);
  const [{ pendingPayments }] = await db.select({ pendingPayments: sql<number>`count(*)` }).from(payments).where(eq(payments.status, "pending"));

  return {
    totalMembers: Number(totalMembers),
    activeMemberships: Number(activeMemberships),
    upcomingClasses: Number(upcomingClasses),
    revenueCents: Number(revenueCents),
    totalCheckins: Number(totalCheckins),
    pendingPayments: Number(pendingPayments),
  };
}

export async function getClassUtilisation(db: Db, limit: number) {
  const rows = await db.select({
    id: classes.id,
    name: classes.name,
    startsAt: classes.startsAt,
    capacity: classes.capacity,
    booked: sql<number>`(select count(*) from ${bookings} where ${bookings.classId} = ${classes.id} and ${bookings.status} in ('booked','attended'))`.as("booked"),
  }).from(classes).where(eq(classes.cancelled, false)).limit(limit);

  return rows.map((r) => ({ ...r, booked: Number(r.booked), utilisation: r.capacity ? Number(r.booked) / r.capacity : 0 }));
}

export async function getRevenueByMonth(db: Db) {
  const rows = await db.select({
    month: sql<string>`strftime('%Y-%m', ${payments.createdAt})`,
    totalCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
  }).from(payments).where(eq(payments.status, "paid")).groupBy(sql`strftime('%Y-%m', ${payments.createdAt})`).orderBy(sql`strftime('%Y-%m', ${payments.createdAt}) DESC`);
  return rows.map((r) => ({ month: r.month, totalCents: Number(r.totalCents) }));
}

export async function getRevenueByMethod(db: Db) {
  const rows = await db.select({
    method: payments.method,
    totalCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
    count: sql<number>`count(*)`,
  }).from(payments).where(eq(payments.status, "paid")).groupBy(payments.method).orderBy(sql`sum(${payments.amountCents}) DESC`);
  return rows.map((r) => ({ method: r.method, totalCents: Number(r.totalCents), count: Number(r.count) }));
}

export async function getExpiringMemberships(db: Db) {
  const today = new Date().toISOString().slice(0, 10);
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return db.select({
    memberId: users.id,
    memberName: users.name,
    memberEmail: users.email,
    planName: membershipPlans.name,
    expiresAt: memberships.endDate,
  }).from(memberships).innerJoin(users, eq(memberships.userId, users.id)).innerJoin(membershipPlans, eq(memberships.planId, membershipPlans.id)).where(and(eq(memberships.status, "active"), gte(memberships.endDate, today), lte(memberships.endDate, in14Days))).orderBy(memberships.endDate);
}

export async function getRefundCount(db: Db) {
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(payments).where(eq(payments.status, "refunded"));
  return { count: Number(result.count) };
}

export async function getCheckinsPerDay(db: Db) {
  const start = new Date();
  start.setDate(start.getDate() - 14);
  const startStr = start.toISOString().slice(0, 10);
  const rows = await db.select({ date: sql<string>`date(${checkins.checkedInAt})`, count: sql<number>`count(*)` }).from(checkins).where(sql`date(${checkins.checkedInAt}) >= ${startStr}`).groupBy(sql`date(${checkins.checkedInAt})`).orderBy(sql`date(${checkins.checkedInAt}) DESC`);
  return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
}

export async function getTopTrainers(db: Db) {
  const start = new Date();
  start.setDate(start.getDate() - 14);
  const startStr = start.toISOString().slice(0, 10);
  const rows = await db.select({
    trainerId: classes.trainerId,
    trainerName: users.name,
    classCount: sql<number>`count(distinct ${bookings.classId})`,
    attendedCount: sql<number>`count(${bookings.id})`,
  }).from(bookings).innerJoin(classes, eq(bookings.classId, classes.id)).innerJoin(users, eq(classes.trainerId, users.id)).where(and(eq(bookings.status, "attended"), sql`date(${classes.startsAt}) >= ${startStr}`)).groupBy(classes.trainerId, users.name).orderBy(sql`count(${bookings.id}) DESC`).limit(10);
  return rows.map((r) => ({ trainerId: r.trainerId, trainerName: r.trainerName, classCount: Number(r.classCount), attendedCount: Number(r.attendedCount) }));
}

export async function getNoShowList(db: Db) {
  const start = new Date();
  start.setDate(start.getDate() - 14);
  const startStr = start.toISOString().slice(0, 10);
  const rows = await db.select({
    bookingId: bookings.id,
    memberId: users.id,
    memberName: users.name,
    memberEmail: users.email,
    className: classes.name,
    classDate: classes.startsAt,
    trainerId: classes.trainerId,
  }).from(bookings).innerJoin(classes, eq(bookings.classId, classes.id)).innerJoin(users, eq(bookings.userId, users.id)).where(and(eq(bookings.status, "no_show"), sql`date(${classes.startsAt}) >= ${startStr}`)).orderBy(sql`${classes.startsAt} DESC`);

  const trainerIds = [...new Set(rows.map((r) => r.trainerId).filter((id) => id != null))];
  const trainers = new Map<number | null, string>();
  if (trainerIds.length > 0) {
    const trainerRows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, trainerIds as number[]));
    trainerRows.forEach((t) => trainers.set(t.id, t.name));
  }
  return rows.map((r) => ({ ...r, trainerName: r.trainerId ? trainers.get(r.trainerId) : undefined }));
}
