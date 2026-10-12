/**
 * The sign-in callback — one route for magic link, email confirmation, and
 * Google.
 *
 * Supabase can hand back either a PKCE `code` or an email `token_hash`, so both
 * are accepted. On success the session cookies are written and the visitor is
 * sent into the app; the proxy will then apply the idle policy. On failure the
 * visitor returns to /signin with a plain reason.
 *
 * After a successful exchange, a freshly signed-in person gets their Sandbox
 * card enrolled best-effort, so an account created through a confirmation
 * email lands ready for the whole arc. Sign-in never fails on this step.
 */

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { ensureSandboxCard } from "@/lib/service";

async function bestEffortSandboxCard(userId: string): Promise<void> {
  try {
    await ensureSandboxCard(userId);
  } catch {
    // Deliberately quiet: pay fails honestly later if the card is missing.
  }
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const supabase = await createServerSupabase();

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data?.user?.id) await bestEffortSandboxCard(data.user.id);
      return NextResponse.redirect(`${origin}${next}`);
    }
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      if (data?.user?.id) await bestEffortSandboxCard(data.user.id);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/signin?reason=link`);
}
