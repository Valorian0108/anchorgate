/**
 * Database health check (`npm run db:check`).
 *
 * Connects with the application's pooled `DATABASE_URL`, confirms the expected
 * tables exist, and prints row counts. This is the quick way to verify that the
 * durable store is reachable and migrated, without opening the Supabase UI.
 *
 * SAFETY: never prints the connection string or any credential. It only prints
 * table names and counts. Secret values are redacted from any error text.
 *
 * Reads `.env` locally (same pattern as `scripts/sandbox-verify.ts`). Exits
 * non-zero when a required table is missing, so it can gate a deploy.
 */

import { existsSync } from "node:fs";
import process from "node:process";

import { sql } from "drizzle-orm";

import { createDatabase } from "../src/infra/persistence";

/** Tables the application requires, created by the committed migrations. */
const EXPECTED_TABLES = [
  "evaluations",
  "purchase_requests",
  "saved_payment_methods",
  "spending_events",
  "spending_rules",
] as const;

/** Load `.env` if present. Missing file is fine (real env vars still work). */
function loadLocalEnv(): void {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }
}

/** Redact anything that looks like `//user:secret@` from an error message. */
function redact(message: string): string {
  return message.replace(/\/\/[^@\s]*@/g, "//***@");
}

async function main(): Promise<void> {
  loadLocalEnv();

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("DATABASE_URL is not set. Add it to `.env` (see `.env.example`).");
    process.exitCode = 1;
    return;
  }

  const { db, sql: client } = createDatabase(url);
  try {
    const existing = (await db.execute(
      sql`select table_name from information_schema.tables
          where table_schema = 'public'
          order by table_name`,
    )) as unknown as Array<{ table_name: string }>;
    const names = existing.map((row) => row.table_name);

    console.log("Tables in this database:");
    for (const table of names) {
      const counted = (await db.execute(
        sql`select count(*)::int as count from ${sql.identifier(table)}`,
      )) as unknown as Array<{ count: number }>;
      console.log(`  ${table.padEnd(24)} ${counted[0]?.count ?? "?"} row(s)`);
    }

    const missing = EXPECTED_TABLES.filter((table) => !names.includes(table));
    console.log();
    if (missing.length > 0) {
      console.log(`MISSING expected table(s): ${missing.join(", ")}`);
      console.log("Run `npm run db:migrate` to create them.");
      process.exitCode = 1;
      return;
    }

    console.log(`OK - all ${EXPECTED_TABLES.length} expected tables are present.`);
    console.log("Durable storage is connected and migrated.");
    console.log("Tables start empty until the application writes to them.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Database check failed: ${redact(message)}`);
  console.error("(No credentials are shown.)");
  process.exitCode = 1;
});
