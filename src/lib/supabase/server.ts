/**
 * The server-side Supabase client.
 *
 * Bound to the request's cookies for Server Components, Server Actions and
 * Route Handlers. Create a fresh client per request — @supabase/ssr documents
 * that reusing one across requests leaves later responses without the required
 * no-store cache headers.
 *
 * Cookie writes from a Server Component render are not supported by Next and
 * throw; we swallow that case because `src/proxy.ts` refreshes and rewrites the
 * session cookies on every request. In Server Actions and Route Handlers the
 * writes do apply and are how sign-in/sign-out persist.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./config";

export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render — Next forbids setting
          // cookies there. The proxy has already refreshed the session, so
          // this is safe to ignore.
        }
      },
    },
  });
}
