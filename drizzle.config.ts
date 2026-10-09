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
 *
 * `drizzle-kit` does not load `.env` by itself, so we load it here (Node 20.12+).
 * This is what makes `npm run db:migrate` work from a local `.env` with no extra
 * setup. The app runtime uses `DATABASE_URL` (see `src/infra/persistence/client.ts`).
 */

import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// Load local secrets without ever printing them. Missing file is fine (CI can
// supply real environment variables instead).
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

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
