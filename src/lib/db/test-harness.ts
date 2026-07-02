import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "./schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Spins up an isolated, in-memory Postgres (via pglite) with the real
 * committed migrations applied. Use in tests that need genuine Postgres
 * semantics (enums, jsonb, joins, group-by) rather than a mock — call
 * `close()` when the test is done.
 */
export async function createTestDb(): Promise<{ db: TestDb; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, close: () => client.close() };
}
