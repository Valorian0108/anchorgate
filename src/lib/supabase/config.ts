/**
 * Supabase configuration, read from the environment.
 *
 * Only the URL and the anon (public) key live here. The anon key is designed to
 * be exposed to a browser; it grants no data access by itself. The
 * `service_role` key is NEVER read by the app — it would bypass row-level
 * security and would put every record one leaked string away from an attacker.
 *
 * Server-side only. Nothing in this folder is imported by a client component.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Add it to .env before using the sign-in slice.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required("SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return required("SUPABASE_ANON_KEY");
}
