import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";

// Load .env.local first (developer overrides), then .env, so drizzle-kit picks
// up DATABASE_URL outside of the Next.js runtime.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Only required for `db:migrate` / `db:push` / `db:studio`.
    // `db:generate` works offline from the schema alone.
    url: process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/placeholder",
  },
  strict: true,
  verbose: true,
});
