import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "./schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Spins up an isolated, in-memory Postgres (via pglite) with the real
 * committed migrations applied. Use in tests that need genuine Postgres
 * semantics (enums, jsonb, joins, group-by) rather than a mock — call
 * `close()` when the test is done. `client` is exposed alongside `db` so
 * tests can inject a query-level failure (e.g. `client.query = ...`) to
 * exercise error-handling paths that don't have a natural SQL trigger.
 */
export async function createTestDb(): Promise<{
  db: TestDb;
  client: PGlite;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, client, close: () => client.close() };
}
