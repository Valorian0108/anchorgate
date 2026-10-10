"use client";

/**
 * The sign-in slip — port of design-research/signin.comp.html.
 *
 * Client component only because it owns the post-submit state (link sent,
 * inline error). It calls the Server Actions in the (auth) route group; the
 * actual sign-in happens on the server.
 */

import { useActionState } from "react";
import {
  sendMagicLink,
  signInWithGoogle,
  type SignInState,
} from "@/app/(auth)/signin/actions";

const INITIAL: SignInState = { status: "idle" };

export function SignInForm() {
  const [state, action, pending] = useActionState(sendMagicLink, INITIAL);

  return (
    <div className="slip">
      <h2>Sign in</h2>
      <div className="sub">Owner only</div>

      {state.status === "sent" ? (
        <div className="sent" role="status">
          <p className="sent-h">Check your inbox</p>
          <p>
            A one-time sign-in link is on its way. Open it on this device. It
            expires soon and works only once.
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

          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send sign-in link"}
          </button>

          {state.status === "error" ? (
            <p className="err" role="alert">
              {state.message}
            </p>
          ) : null}
        </form>
      )}

      <div className="or">or</div>

      <form action={signInWithGoogle}>
        <button className="btn-ghost" type="submit">
          Continue with Google
        </button>
      </form>

      <div className="slip-note">
        Owner only. We email you a one-time link and never store a password. For
        your safety, you are signed out after 30 minutes of no activity.
      </div>
    </div>
  );
}
