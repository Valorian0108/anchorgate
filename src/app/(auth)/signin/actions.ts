"use server";

/**
 * Sign-in and sign-up Server Actions.
 *
 * All of these run on the server. Nothing here trusts the form: addresses are
 * validated before any network call, and passwords are never logged, stored,
 * or handled by this app beyond handing them to Supabase Auth (which stores
 * only a hash).
 *
 * Who may enter: any signed-in account. Each person sees only their own data;
 * the scoped stores and the database's row-level-security policies enforce it.
 *
 * The magic link stays OWNER-ONLY on purpose: Supabase's built-in email sender
 * allows 2 auth emails per hour project-wide, so links must not become the
 * path everyone uses. Password sign-in is the primary path for all.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/auth/owner";
import { ensureSandboxCard } from "@/lib/service";

export type SignInState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; message: string };

export type SignUpState =
  | { status: "idle" }
  | { status: "check-email" }
  | { status: "error"; message: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;

/**
 * Supabase's *built-in* email sender allows only **2 auth emails per hour,
 * project-wide** (plus a 60s gap between sends to the same address). That cap
 * is not configurable without a custom SMTP provider, so a couple of test
 * clicks exhausts it. Say so plainly instead of surfacing the raw 429 string.
 */
function friendlyEmailError(message: string): string {
  if (/rate limit/i.test(message)) {
    return (
      "The built-in email sender allows only 2 sign-in emails per hour. " +
      "Wait for the window to reset, or connect a custom SMTP provider " +
      "(see AUTH.md §5)."
    );
  }
  return message;
}

/** Plain sentences for password sign-in failures. */
function friendlySignInError(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "That email and password do not match. Try again, or create your gate.";
  }
  if (/rate limit/i.test(message)) {
    return "Too many attempts just now. Wait a moment, then try again.";
  }
  return message;
}

/** Plain sentences for sign-up failures. */
function friendlySignUpError(message: string): string {
  if (/already registered|user already/i.test(message)) {
    return "That email already has a gate. Try signing in.";
  }
  if (/password.*short|weak password|password.*length/i.test(message)) {
    return `Use at least ${MIN_PASSWORD} characters for your password.`;
  }
  if (/rate limit/i.test(message)) {
    return "Too many attempts just now. Wait a moment, then try again.";
  }
  return message;
}

/**
 * Give a freshly signed-in person their Sandbox card when they do not have
 * one yet. Best-effort on purpose: sign-in must never fail because PayPal or
 * the database hiccuped. Without a card the person can still set rules and
 * ask; the pay step then fails with its own honest sentence.
 */
async function bestEffortSandboxCard(userId: string): Promise<void> {
  try {
    await ensureSandboxCard(userId);
  } catch {
    // Deliberately quiet: nothing here is worse than blocking the sign-in.
  }
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

/**
 * The primary path: email and password. On success the session cookies are
 * already written by the Supabase client, so this redirects into the app.
 */
export async function signInWithPassword(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !EMAIL.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }
  if (!password) {
    return { status: "error", message: "Enter your password." };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data?.user) {
    return {
      status: "error",
      message: friendlySignInError(error?.message ?? "Sign-in did not complete."),
    };
  }

  await bestEffortSandboxCard(data.user.id);
  redirect("/");
}

/**
 * Create an account with email and password.
 *
 * Two honest endings:
 *   - the project does not require email confirmation: a session exists right
 *     away, so this redirects into the app;
 *   - confirmation is required: no session yet, and the person is told to open
 *     the confirmation email (the callback finishes the sign-in).
 */
export async function signUp(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!email || !EMAIL.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }
  if (password.length < MIN_PASSWORD) {
    return {
      status: "error",
      message: `Use at least ${MIN_PASSWORD} characters for your password.`,
    };
  }
  if (password !== confirm) {
    return { status: "error", message: "The two passwords do not match." };
  }

  const origin = await requestOrigin();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) {
    return { status: "error", message: friendlySignUpError(error.message) };
  }

  if (data?.session) {
    await bestEffortSandboxCard(data.session.user.id);
    redirect("/");
  }
  return { status: "check-email" };
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

  // Owner-only, checked before the network call: the built-in sender's hourly
  // cap is tiny, and this app must never mail an arbitrary address.
  if (!isOwnerEmail(email)) {
    return {
      status: "error",
      message:
        "Emailed links are set up for the demo owner only. Please use your password, or create your gate.",
    };
  }

  const origin = await requestOrigin();
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) {
    return { status: "error", message: friendlyEmailError(error.message) };
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
  // enabled there, surface a clear road back to the password method.
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
