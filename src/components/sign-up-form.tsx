"use client";

/**
 * The sign-up slip — create a gate with email and password.
 *
 * Client component only for the post-submit state: inline errors, or the
 * "check your inbox" beat when the project asks for email confirmation. The
 * server action does the real work; when a session comes straight back it
 * redirects into the app and this component never renders again.
 */

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type SignUpState } from "@/app/(auth)/signin/actions";

const INITIAL: SignUpState = { status: "idle" };

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, INITIAL);

  return (
    <div className="slip">
      <h2>Create your gate</h2>
      <div className="sub">Two minutes to set up. Yours alone.</div>

      {state.status === "check-email" ? (
        <div className="sent" role="status">
          <p className="sent-h">Check your inbox</p>
          <p>
            One last step: open the confirmation email and click the link
            inside. Your gate opens right after.
          </p>
        </div>
      ) : (
        <form action={action}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="at least 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="confirm">Repeat password</label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              placeholder="once more, to be sure"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create account"}
          </button>

          {state.status === "error" ? (
            <p className="err" role="alert">
              {state.message}
            </p>
          ) : null}
        </form>
      )}

      <div className="to">
        Already have a gate? <Link href="/signin">Sign in</Link>
      </div>

      <div className="slip-note">
        This demo runs on the PayPal Sandbox: no real money ever moves. Your
        password is kept by Supabase as a hash, never by this app. For your
        safety, you are signed out after 30 minutes of no activity.
      </div>
    </div>
  );
}
