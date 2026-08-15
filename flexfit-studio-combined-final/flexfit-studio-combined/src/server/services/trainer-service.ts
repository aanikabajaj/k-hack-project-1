import { TRPCError } from "@trpc/server";
import { and, eq, gte } from "drizzle-orm";
import { classes, trainerAvailability } from "@/db/schema";

type Db = typeof import("@/db").db;

function requireTrainer(role: string) {
  if (role !== "trainer") throw new TRPCError({ code: "FORBIDDEN", message: "Only trainers can access this." });
}

export async function upcomingClasses(db: Db, userId: number, role: string) {
  requireTrainer(role);
  const now = new Date().toISOString();
  return db.select({ id: classes.id, name: classes.name, room: classes.room, startsAt: classes.startsAt, durationMin: classes.durationMin, cancelled: classes.cancelled }).from(classes).where(and(eq(classes.trainerId, userId), gte(classes.startsAt, now), eq(classes.cancelled, false))).orderBy(classes.startsAt);
}

export async function availability(db: Db, userId: number, role: string) {
  requireTrainer(role);
  return db.select().from(trainerAvailability).where(eq(trainerAvailability.trainerId, userId)).orderBy(trainerAvailability.dayOfWeek);
}

export async function setAvailability(db: Db, userId: number, role: string, dayOfWeek: number, startTime: string, endTime: string) {
  requireTrainer(role);
  const existing = await db.select().from(trainerAvailability).where(and(eq(trainerAvailability.trainerId, userId), eq(trainerAvailability.dayOfWeek, dayOfWeek))).get();
  if (existing) return db.update(trainerAvailability).set({ startTime, endTime }).where(eq(trainerAvailability.id, existing.id)).returning().get();
  return db.insert(trainerAvailability).values({ trainerId: userId, dayOfWeek, startTime, endTime }).returning().get();
}

export async function removeAvailability(db: Db, userId: number, role: string, dayOfWeek: number) {
  requireTrainer(role);
  const existing = await db.select().from(trainerAvailability).where(and(eq(trainerAvailability.trainerId, userId), eq(trainerAvailability.dayOfWeek, dayOfWeek))).get();
  if (existing) await db.delete(trainerAvailability).where(eq(trainerAvailability.id, existing.id));
  return { success: true };
}

export async function checkAvailability(db: Db, role: string, trainerId: number, startsAt: string, durationMin: number) {
  if (role !== "trainer" && role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Staff only." });
  const classStart = new Date(startsAt);
  const classEnd = new Date(classStart.getTime() + durationMin * 60000);
  const dayOfWeek = classStart.getUTCDay();
  const startTimeStr = String(classStart.getUTCHours()).padStart(2, "0") + ":" + String(classStart.getUTCMinutes()).padStart(2, "0");
  const endTimeStr = String(classEnd.getUTCHours()).padStart(2, "0") + ":" + String(classEnd.getUTCMinutes()).padStart(2, "0");
  const row = await db.select().from(trainerAvailability).where(and(eq(trainerAvailability.trainerId, trainerId), eq(trainerAvailability.dayOfWeek, dayOfWeek))).get();
  if (!row) return { available: false, reason: "No availability set for this day" };
  if (!(startTimeStr >= row.startTime && endTimeStr <= row.endTime)) return { available: false, reason: "Outside availability hours" };

  const conflictingClasses = await db.select().from(classes).where(and(eq(classes.trainerId, trainerId), eq(classes.cancelled, false)));
  for (const cls of conflictingClasses) {
    const existStart = new Date(cls.startsAt);
    const existEnd = new Date(existStart.getTime() + cls.durationMin * 60000);
    if (classStart < existEnd && classEnd > existStart) return { available: false, reason: "Trainer already has a class at this time" };
  }
  return { available: true };
}
