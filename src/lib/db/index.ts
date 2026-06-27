import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

import { env, integrations, requireEnv } from "@/lib/env";
import * as schema from "./schema";

export { schema };
export const isDatabaseConfigured = integrations.database;

type Database = NeonHttpDatabase<typeof schema>;

let cached: Database | null = null;

/**
 * Returns the Drizzle client, creating it on first use. Throws a clear error if
 * DATABASE_URL is missing — call this only where a DB is actually needed so the
 * app still boots unconfigured.
 */
export function getDb(): Database {
  if (!cached) {
    const url = requireEnv(env.database.url, "DATABASE_URL");
    const sql = neon(url);
    cached = drizzle(sql, { schema });
  }
  return cached;
}

/**
 * Convenience proxy so callers can `import { db }` and use it directly. Access
 * is lazy: the underlying client is only constructed when a method is invoked,
 * and methods are bound to the real client so Drizzle's internals work.
 */
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
