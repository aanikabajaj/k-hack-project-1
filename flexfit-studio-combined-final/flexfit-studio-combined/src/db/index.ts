import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof createClient> | undefined;
};

const client =
  globalForDb.client ??
  createClient({ url: process.env.DB_FILE ?? "file:flexfit.db" });

if (process.env.NODE_ENV !== "production") {
  globalForDb.client = client;
}

export const db = drizzle(client, { schema });
export { schema };

/**
 * The type shared helpers in `server/routers/` accept for their `db`
 * parameter, so the same function can run either directly against `db` or
 * against the `tx` handed to a `db.transaction(async (tx) => ...)`
 * callback - multi-step mutations (book, cancel, reschedule, subscribe) use
 * a transaction so a capacity/credit check and the write it gates can't be
 * split by a concurrent request; read-only queries just use `db`.
 */
export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
