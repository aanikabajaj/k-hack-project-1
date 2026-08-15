import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { upcomingClasses, availability, setAvailability, removeAvailability, checkAvailability } from "../services/trainer-service";

export const trainersRouter = router({
  upcomingClasses: protectedProcedure.query(({ ctx }) => upcomingClasses(ctx.db, ctx.user.id, ctx.user.role)),
  availability: protectedProcedure.query(({ ctx }) => availability(ctx.db, ctx.user.id, ctx.user.role)),
  setAvailability: protectedProcedure.input(z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: z.string(), endTime: z.string() })).mutation(({ ctx, input }) => setAvailability(ctx.db, ctx.user.id, ctx.user.role, input.dayOfWeek, input.startTime, input.endTime)),
  removeAvailability: protectedProcedure.input(z.object({ dayOfWeek: z.number().int().min(0).max(6) })).mutation(({ ctx, input }) => removeAvailability(ctx.db, ctx.user.id, ctx.user.role, input.dayOfWeek)),
  checkAvailability: protectedProcedure.input(z.object({ trainerId: z.number(), startsAt: z.string(), durationMin: z.number() })).query(({ ctx, input }) => checkAvailability(ctx.db, ctx.user.role, input.trainerId, input.startsAt, input.durationMin)),
});
