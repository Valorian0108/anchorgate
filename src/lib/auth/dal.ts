/**
 * The data-access layer (DAL) — the authoritative gate.
 *
 * Next's auth guide is explicit: `proxy.ts` may do optimistic redirects, but it
 * must not be the security boundary. Every page and every Server Action funnels
 * through here, so the identity, owner allowlist and idle timeout are re-checked
 * on the server for each render and each mutation.
 *
 * `getOwner` is wrapped in React's `cache`, so a layout and the page beneath it
 * share one lookup per render pass.
 */

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { IDLE_COOKIE, assessStamp, isOwnerEmail } from "./owner";

export interface Owner {
  userId: string;
  email: string;
}

/**
 * Resolve the signed-in owner, or `null`. Returns null when the caller is not
 * signed in, is signed in as someone other than the owner, or has been idle for
 * longer than the window.
 */
export const getOwner = cache(async (): Promise<Owner | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !isOwnerEmail(user.email)) return null;

  const token = (await cookies()).get(IDLE_COOKIE)?.value;
  const assessment = assessStamp(user.id, token);
  if (assessment === "idle" || assessment === "forged") return null;

  return { userId: user.id, email: user.email };
});

/**
 * Require the owner, redirecting to sign-in when absent. Use at the top of
 * every protected page and inside every Server Action.
 */
export async function verifyOwner(): Promise<Owner> {
  const owner = await getOwner();
  if (!owner) redirect("/signin");
  return owner;
}
