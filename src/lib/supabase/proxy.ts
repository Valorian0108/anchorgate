/**
 * The Proxy's Supabase helper: refresh the session on every request and apply
 * the coarse access policy.
 *
 * Responsibilities, in order:
 *   - refresh the Supabase session and write rotated cookies to the response;
 *   - send unauthenticated visitors on protected paths to /signin;
 *   - refuse a session that has been idle past the window, and sign it out;
 *   - refresh the signed activity stamp on genuine activity.
 *
 * Any signed-in account may enter; per-person data separation is enforced by
 * the scoped stores behind the DAL, and in depth by the database's own
 * row-level-security policies.
 *
 * This is an OPTIMISTIC layer. The authoritative re-check is the DAL
 * (`src/lib/auth/dal.ts`), which every page and action calls. Keeping the
 * timeout policy here as well lets an idle session be signed out and redirected
 * before a single byte of the app is rendered.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./config";
import {
  IDLE_COOKIE,
  assessStamp,
  signStamp,
  stampCookieOptions,
} from "@/lib/auth/owner";

/**
 * Paths reachable without a session. `/auth/*` is the magic-link / OAuth
 * callback surface; `/signin` and `/signup` are the front doors.
 */
const PUBLIC_PREFIXES = ["/signin", "/signup", "/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Touching the user is what triggers a token refresh, which is written back
  // through `setAll` above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  /**
   * Build a redirect that also carries any cookies the Supabase client has set
   * on `response` so far (cleared auth cookies after sign-out, rotated tokens).
   */
  function redirectTo(path: string): NextResponse {
    const url = new URL(path, request.url);
    const res = NextResponse.redirect(url);
    for (const setCookie of response.headers.getSetCookie()) {
      res.headers.append("set-cookie", setCookie);
    }
    return res;
  }

  // Not signed in.
  if (!user) {
    // Bridge a Supabase Site-URL fallback: if the project's Redirect URLs are
    // not configured yet, the magic-link `code` lands on the app root instead
    // of the callback. Forward it so sign-in still completes.
    if (pathname === "/" && request.nextUrl.searchParams.has("code")) {
      const search = request.nextUrl.search;
      return redirectTo(`/auth/confirm${search}`);
    }
    return isPublic(pathname) ? response : redirectTo("/signin");
  }

  // Signed in, but idle or presenting a stamp that does not authenticate —
  // refuse and clear the session. A missing stamp is a fresh session: the
  // window starts now.
  const assessment = assessStamp(
    user.id,
    request.cookies.get(IDLE_COOKIE)?.value,
  );
  if (assessment === "idle" || assessment === "forged") {
    await supabase.auth.signOut({ scope: "local" });
    return redirectTo("/signin?reason=timeout");
  }

  // Genuine activity: refresh the signed stamp. Write it to the request as well
  // as the response so the data-access layer sees it in this same pass.
  const stamp = signStamp(user.id, Date.now());
  request.cookies.set(IDLE_COOKIE, stamp);
  response.cookies.set(IDLE_COOKIE, stamp, stampCookieOptions());

  // A signed-in owner should not sit on the sign-in screen.
  if (isPublic(pathname)) {
    return redirectTo("/");
  }

  return response;
}
