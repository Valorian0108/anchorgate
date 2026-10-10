"use server";

/**
 * Sign-in Server Actions — owner only.
 *
 * All three run on the server. Nothing here trusts the form: the address is
 * validated and checked against the owner allowlist BEFORE a link is ever sent,
 * so this app cannot be used to mail a non-owner. The magic-link callback and
 * the OAuth callback exchange their code in `src/app/auth/confirm/route.ts`.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/auth/owner";

export type SignInState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; message: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Supabase's *built-in* email sender allows only **2 auth emails per hour,
 * project-wide** (plus a 60s gap between sends to the same address). That cap
 * is not configurable without a custom SMTP provider, so a couple of test
 * clicks exhausts it. Say so plainly instead of surfacing the raw 429 string.
 */
function friendlyError(message: string): string {
  if (/rate limit/i.test(message)) {
    return (
      "The built-in email sender allows only 2 sign-in emails per hour. " +
      "Wait for the window to reset, or connect a custom SMTP provider " +
      "(see AUTH.md §5)."
    );
  }
  return message;
}

/** Prefer the browser's Origin; fall back to forwarded host headers. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function sendMagicLink(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !EMAIL.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  // Owner-only, checked before the network call: never send a link to anyone
  // else, and never disclose whether an arbitrary address has an account.
  if (!isOwnerEmail(email)) {
    return {
      status: "error",
      message: "This gate is owner-only. That address is not the owner.",
    };
  }

  const origin = await requestOrigin();
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) {
    return { status: "error", message: friendlyError(error.message) };
  }
  return { status: "sent" };
}

export async function signInWithGoogle(): Promise<void> {
  const origin = await requestOrigin();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/confirm` },
  });

  // Google is configured in the Supabase dashboard, not in code. Until it is
  // enabled there, surface a clear road back to the link method.
  if (error || !data?.url) {
    redirect("/signin?reason=provider");
  }
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/signin");
}
