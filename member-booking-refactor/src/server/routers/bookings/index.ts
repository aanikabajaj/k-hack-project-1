import { router } from "@/server/trpc";
import { memberBookingProcedures } from "./member";
import { staffBookingProcedures } from "./staff";

/**
 * Same flat shape as before the split (`trpc.bookings.mine`,
 * `trpc.bookings.markAttended`, etc.) - only the file layout changed.
 */
export const bookingsRouter = router({
  ...memberBookingProcedures,
  ...staffBookingProcedures,
});
