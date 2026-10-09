/**
 * Drizzle Kit configuration (migrations).
 *
 * Migrations connect directly (session mode), so use a direct/session URL here.
 * The application runtime uses the pooled `DATABASE_URL` in `src/infra/persistence/client.ts`.
 *
 * This file is intentionally OUTSIDE the `src/` TypeScript project and is not
 * typechecked by `npm run typecheck`.
 *
 * Requires the env var DATABASE_URL_DIRECT (see `.env.example`). It is never
 * committed.
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/infra/persistence/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
