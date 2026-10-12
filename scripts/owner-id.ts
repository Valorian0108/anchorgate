/**
 * Resolve the owner's Supabase user id for CLI scripts.
 *
 * The web app gets the user id from the signed-in session; scripts have no
 * session, so they resolve it from `OWNER_EMAIL` (already in `.env`) against
 * `auth.users` using the same direct connection the migrations use. The id is
 * an identifier, not a credential; this never prints or stores secrets.
 */

import { sql } from "drizzle-orm";

import type { AppDatabase } from "../src/infra/persistence";

/** The owner's Supabase auth user id, or a loud failure explaining why not. */
export async function resolveOwnerUserId(db: AppDatabase): Promise<string> {
  const email = process.env.OWNER_EMAIL;
  if (!email) {
    throw new Error(
      "OWNER_EMAIL is not set, so the CLI cannot tell whose data to act on. Add it to .env.",
    );
  }

  const rows = (await db.execute(
    sql`select id::text as id from auth.users where email = ${email} limit 1`,
  )) as unknown as Array<{ id: string }>;
  const userId = Array.isArray(rows) ? rows[0]?.id : undefined;

  if (!userId) {
    throw new Error(
      `No Supabase user found for OWNER_EMAIL. Sign in to the app once with that address, then retry.`,
    );
  }
  return userId;
}
