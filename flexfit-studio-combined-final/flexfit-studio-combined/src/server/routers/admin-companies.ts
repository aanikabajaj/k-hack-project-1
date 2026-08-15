import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { listCompanies, getCompanyById, createCompany, updateCompanyActive, topUpCompany, linkMember, unlinkMember } from "../services/company-service";

export const adminCompaniesRouter = router({
  list: adminProcedure.query(({ ctx }) => listCompanies(ctx.db)),
  getById: adminProcedure.input(z.object({ id: z.number() })).query(({ ctx, input }) => getCompanyById(ctx.db, input.id)),
  create: adminProcedure.input(z.object({ name: z.string().min(1), contactEmail: z.string().email(), creditPoolBalance: z.number().int().default(0) })).mutation(({ ctx, input }) => createCompany(ctx.db, input)),
  updateActive: adminProcedure.input(z.object({ id: z.number(), active: z.boolean() })).mutation(({ ctx, input }) => updateCompanyActive(ctx.db, input.id, input.active)),
  topUp: adminProcedure.input(z.object({ id: z.number(), amount: z.number().int().positive() })).mutation(({ ctx, input }) => topUpCompany(ctx.db, input.id, input.amount)),
  linkMember: adminProcedure.input(z.object({ companyId: z.number(), userId: z.number() })).mutation(({ ctx, input }) => linkMember(ctx.db, input.companyId, input.userId)),
  unlinkMember: adminProcedure.input(z.object({ companyMemberId: z.number() })).mutation(({ ctx, input }) => unlinkMember(ctx.db, input.companyMemberId)),
});
