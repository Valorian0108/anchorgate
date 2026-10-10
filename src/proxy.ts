/**
 * AnchorGate — Proxy (Next.js 16's renamed Middleware).
 *
 * In Next.js 16 the `middleware` file convention is deprecated and renamed to
 * `proxy`, and it runs on the Node.js runtime by default — which lets this file
 * use `node:crypto` for the signed idle stamp.
 *
 * The proxy keeps the session fresh and turns away the obviously-not-allowed
 * (no session, not the owner, idle past the window). It is an OPTIMISTIC guard:
 * the authoritative check runs in the data-access layer on every page and
 * action.
 */

import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except Next's static output, image optimization and common
    // asset files. Auth and page routes all flow through the proxy.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest)$).*)",
  ],
};
