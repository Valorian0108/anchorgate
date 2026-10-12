/**
 * Owner identity and the idle-session marker.
 *
 * Two facts live here, both server-side:
 *
 *   1. WHO the demo owner is. `OWNER_EMAIL` names the one account allowed to
 *      sign in by emailed link (the built-in sender's 2-per-hour cap is why
 *      links stay owner-only). Everyone else signs in with a password.
 *
 *   2. WHEN a person was last active. The 30-minute idle timeout is enforced
 *      from a signed, HttpOnly cookie (`ag_seen`). The cookie carries the user
 *      id and the last-active instant, authenticated with an HMAC. A tampered
 *      cookie fails verification and the session is treated as idle — the check
 *      is server-side and the value is not forgeable without `SESSION_SECRET`.
 *
 * This module must stay free of Next.js imports so both `proxy.ts` (request
 * path) and the data-access layer can use it.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** The demo owner's address: the one account allowed emailed sign-in links. */
export const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();

/** Idle window: 30 minutes. The server refuses a session past this gap. */
export const IDLE_MS = 30 * 60 * 1000;

/** Name of the signed activity cookie. */
export const IDLE_COOKIE = "ag_seen";

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  // Fail closed: with no configured owner, nobody is the owner.
  if (!OWNER_EMAIL) return false;
  return email.trim().toLowerCase() === OWNER_EMAIL;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET is not set. Cannot sign session activity.");
  }
  return value;
}

function mac(userId: string, at: number): string {
  return createHmac("sha256", secret())
    .update(`${userId}.${at}`)
    .digest("base64url");
}

/**
 * Produce the cookie value `<issuedAt>.<hmac>` for a user, at a given instant.
 * Exposed for tests; production callers use `touchStamp`.
 */
export function signStamp(userId: string, at: number): string {
  return `${at}.${mac(userId, at)}`;
}

/**
 * Verify a cookie value for a user. Returns the last-active instant in epoch
 * milliseconds, or `null` if the token is missing, malformed, or not
 * authentically signed for this user.
 */
export function verifyStamp(
  userId: string,
  token: string | null | undefined,
): number | null {
  if (!token) return null;

  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const at = Number(token.slice(0, dot));
  const provided = token.slice(dot + 1);
  if (!Number.isFinite(at) || !provided) return null;

  const expected = mac(userId, at);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return at;
}

/** True when the last-active instant is older than the idle window. */
export function isIdle(at: number | null, now: number = Date.now()): boolean {
  return at === null || now - at > IDLE_MS;
}

/**
 * Classify the activity cookie:
 *
 *   - `fresh`  — no cookie at all. This is a brand-new session (the window
 *                starts now), or a cleared cookie; either way we begin a window.
 *   - `active` — a validly signed stamp inside the window.
 *   - `idle`   — a validly signed stamp past the window.
 *   - `forged` — a value that does not authenticate for this user.
 *
 * Both the proxy and the DAL refuse `idle` and `forged`.
 */
export type StampAssessment = "fresh" | "active" | "idle" | "forged";

export function assessStamp(
  userId: string,
  token: string | null | undefined,
  now: number = Date.now(),
): StampAssessment {
  if (token === null || token === undefined || token === "") return "fresh";
  const at = verifyStamp(userId, token);
  if (at === null) return "forged";
  return isIdle(at, now) ? "idle" : "active";
}

/** Cookie attributes for the activity stamp. */
export function stampCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IDLE_MS / 1000,
  };
}
