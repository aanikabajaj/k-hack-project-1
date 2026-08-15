import { z } from "zod";
import { router, protectedProcedure, staffProcedure } from "../trpc";
import { listMine, book, cancel, markAttended, rosterFor } from "../services/corporate-booking-service";

export const corporateBookingsRouter = router({
  mine: protectedProcedure.input(z.object({ includePast: z.boolean().default(false) }).default({})).query(({ ctx, input }) => listMine(ctx.db, ctx.user.id, input.includePast)),
  book: protectedProcedure.input(z.object({ classId: z.number() })).mutation(({ ctx, input }) => book(ctx.db, ctx.user.id, input.classId)),
  cancel: protectedProcedure.input(z.object({ bookingId: z.number() })).mutation(({ ctx, input }) => cancel(ctx.db, ctx.user.id, ctx.user.role, input.bookingId)),
  markAttended: staffProcedure.input(z.object({ bookingId: z.number(), source: z.enum(["front_desk", "kiosk", "app"]).default("front_desk") })).mutation(({ ctx, input }) => markAttended(ctx.db, input.bookingId)),
  rosterFor: staffProcedure.input(z.object({ classId: z.number() })).query(({ ctx, input }) => rosterFor(ctx.db, input.classId)),
});
