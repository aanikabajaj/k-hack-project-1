import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import {
  getAdminStats,
  getClassUtilisation,
  getRevenueByMonth,
  getRevenueByMethod,
  getExpiringMemberships,
  getRefundCount,
  getCheckinsPerDay,
  getTopTrainers,
  getNoShowList,
} from "../services/admin-report-service";

export const adminRouter = router({
  stats: adminProcedure.query(({ ctx }) => getAdminStats(ctx.db)),
  classUtilisation: adminProcedure.input(z.object({ limit: z.number().default(10) }).default({})).query(({ ctx, input }) => getClassUtilisation(ctx.db, input.limit)),
  revenueByMonth: adminProcedure.query(({ ctx }) => getRevenueByMonth(ctx.db)),
  revenueByMethod: adminProcedure.query(({ ctx }) => getRevenueByMethod(ctx.db)),
  expiringMemberships: adminProcedure.query(({ ctx }) => getExpiringMemberships(ctx.db)),
  refundCount: adminProcedure.query(({ ctx }) => getRefundCount(ctx.db)),
  checkinsPerDay: adminProcedure.query(({ ctx }) => getCheckinsPerDay(ctx.db)),
  topTrainers: adminProcedure.query(({ ctx }) => getTopTrainers(ctx.db)),
  noShowList: adminProcedure.query(({ ctx }) => getNoShowList(ctx.db)),
});
