"use client";

/**
 * The sign-in slip.
 *
 * Client component only because it owns the post-submit state (inline errors,
 * link sent) and the mode switch between the two ways in: a password (the path
 * for everyone) and an emailed one-time link (set up for the demo owner). It
 * calls the Server Actions in the (auth) route group; the actual sign-in
 * happens on the server.
 */

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  sendMagicLink,
  signInWithGoogle,
  signInWithPassword,
  type SignInState,
} from "@/app/(auth)/signin/actions";

const INITIAL: SignInState = { status: "idle" };

export function SignInForm() {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, INITIAL);
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, INITIAL);

  return (
    <div className="slip">
      <h2>Sign in</h2>
      <div className="sub">Your gate, your rules</div>

      {mode === "password" ? (
        <form action={pwAction}>
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
              placeholder="your password"
              autoComplete="current-password"
              required
            />
          </div>

          <button className="btn" type="submit" disabled={pwPending}>
            {pwPending ? "Signing in…" : "Sign in"}
          </button>

          {pwState.status === "error" ? (
            <p className="err" role="alert">
              {pwState.message}
            </p>
          ) : null}
        </form>
      ) : linkState.status === "sent" ? (
        <div className="sent" role="status">
          <p className="sent-h">Check your inbox</p>
          <p>
            A one-time sign-in link is on its way. Open it on this device. It
            expires soon and works only once.
          </p>
        </div>
      ) : (
        <form action={linkAction}>
          <div className="field">
            <label htmlFor="link-email">Email</label>
            <input
              id="link-email"
              name="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </div>

          <button className="btn" type="submit" disabled={linkPending}>
            {linkPending ? "Sending…" : "Send sign-in link"}
          </button>

          {linkState.status === "error" ? (
            <p className="err" role="alert">
              {linkState.message}
            </p>
          ) : null}
        </form>
      )}

      {mode === "password" ? (
        <div className="switch-row">
          <button
            type="button"
            className="switch"
            onClick={() => setMode("link")}
          >
            Owner? Use an emailed one-time link instead
          </button>
        </div>
      ) : linkState.status === "sent" ? null : (
        <div className="switch-row">
          <button
            type="button"
            className="switch"
            onClick={() => setMode("password")}
          >
            Use your password instead
          </button>
        </div>
      )}

      <div className="or">or</div>

      <form action={signInWithGoogle}>
        <button className="btn-ghost" type="submit">
          Continue with Google
        </button>
      </form>

      <div className="to">
        New here? <Link href="/signup">Create your gate</Link>
      </div>

      <div className="slip-note">
        For your safety, you are signed out after 30 minutes of no activity.
      </div>
    </div>
  );
}
