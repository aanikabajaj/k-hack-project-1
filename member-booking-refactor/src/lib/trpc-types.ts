import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

/**
 * Component props can pull a query's exact return type straight from the
 * router instead of a hand-typed copy that can drift out of sync with it,
 * e.g. `RouterOutputs["bookings"]["mine"][number]` for one row of
 * `trpc.bookings.mine.useQuery()`.
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
