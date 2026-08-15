import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { companies, companyMembers, users, corporateBookings, classes } from "@/db/schema";

type Db = typeof import("@/db").db;

export async function listCompanies(db: Db) {
  return db.select({ id: companies.id, name: companies.name, contactEmail: companies.contactEmail, creditPoolBalance: companies.creditPoolBalance, active: companies.active, createdAt: companies.createdAt }).from(companies).orderBy(desc(companies.createdAt));
}

export async function getCompanyById(db: Db, id: number) {
  const company = await db.select().from(companies).where(eq(companies.id, id)).get();
  if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });

  const members = await db.select({ id: users.id, companyMemberId: companyMembers.id, name: users.name, email: users.email, phone: users.phone }).from(companyMembers).innerJoin(users, eq(companyMembers.userId, users.id)).where(eq(companyMembers.companyId, company.id)).orderBy(users.name);
  const recentBookings = await db.select({ id: corporateBookings.id, status: corporateBookings.status, creditsUsed: corporateBookings.creditsUsed, bookedAt: corporateBookings.bookedAt, className: classes.name, startsAt: classes.startsAt, memberName: users.name }).from(corporateBookings).innerJoin(classes, eq(corporateBookings.classId, classes.id)).innerJoin(users, eq(corporateBookings.userId, users.id)).where(eq(corporateBookings.companyId, company.id)).orderBy(desc(corporateBookings.bookedAt)).limit(20);
  return { ...company, members, recentBookings };
}

export async function createCompany(db: Db, input: { name: string; contactEmail: string; creditPoolBalance: number }) {
  return db.insert(companies).values({ name: input.name, contactEmail: input.contactEmail, creditPoolBalance: input.creditPoolBalance, active: true }).returning().get();
}

export async function updateCompanyActive(db: Db, id: number, active: boolean) {
  const company = await db.select().from(companies).where(eq(companies.id, id)).get();
  if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
  return db.update(companies).set({ active }).where(eq(companies.id, id)).returning().get();
}

export async function topUpCompany(db: Db, id: number, amount: number) {
  const company = await db.select().from(companies).where(eq(companies.id, id)).get();
  if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
  return db.update(companies).set({ creditPoolBalance: company.creditPoolBalance + amount }).where(eq(companies.id, id)).returning().get();
}

export async function linkMember(db: Db, companyId: number, userId: number) {
  const company = await db.select().from(companies).where(eq(companies.id, companyId)).get();
  if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
  if (user.role !== "member") throw new TRPCError({ code: "BAD_REQUEST", message: "Only members can be linked to companies." });
  const existing = await db.select().from(companyMembers).where(and(eq(companyMembers.userId, userId), eq(companyMembers.companyId, companyId))).get();
  if (existing) throw new TRPCError({ code: "CONFLICT", message: "This member is already linked to this company." });
  return db.insert(companyMembers).values({ userId, companyId }).returning().get();
}

export async function unlinkMember(db: Db, companyMemberId: number) {
  const companyMember = await db.select().from(companyMembers).where(eq(companyMembers.id, companyMemberId)).get();
  if (!companyMember) throw new TRPCError({ code: "NOT_FOUND", message: "Company member link not found." });
  await db.delete(companyMembers).where(eq(companyMembers.id, companyMemberId));
  return { ok: true };
}
