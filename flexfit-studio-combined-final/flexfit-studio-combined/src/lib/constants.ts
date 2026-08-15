/**
 * Client- and server-safe shared constants. Anything that only the server
 * needs (query helpers, DB access) belongs in `server/routers/booking-rules.ts`
 * instead - this file exists so a plain value like `UNLIMITED_CREDITS` can be
 * imported from a client component without dragging server-only code
 * (Drizzle queries, DB schema) into the browser bundle.
 */

/** Plans/memberships with this many credits are treated as unlimited. */
export const UNLIMITED_CREDITS = 999;
