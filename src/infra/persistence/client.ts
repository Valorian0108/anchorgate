/**
 * Database client factory.
 *
 * The connection string is read from the environment by the application, never
 * hard-coded and never exposed to the browser. This module only turns a
 * connection string into a Drizzle client; it does not read `process.env` itself,
 * so importing it has no side effects.
 *
 * Supabase note: when using the connection pooler (Supavisor/pgBouncer), prepared
 * statements must be disabled, hence `prepare: false`.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Driver-agnostic Drizzle handle.
 *
 * The three `any` type parameters are required because the concrete type differs
 * per driver (postgres-js in the app, PGlite in tests). The stores only use the
 * shared query-builder surface, so this is safe and intentional.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppDatabase = PgDatabase<any, any, any>;

export interface DatabaseHandle {
  db: PostgresJsDatabase<typeof schema>;
  /** The underlying driver handle, for closing the pool. */
  sql: ReturnType<typeof postgres>;
}

/** Create a pooled Postgres client for the application runtime. */
export function createDatabase(connectionString: string): DatabaseHandle {
  const sql = postgres(connectionString, { prepare: false, max: 10 });
  const db = drizzle(sql, { schema });
  return { db, sql };
}
