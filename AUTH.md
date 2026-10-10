# AUTH.md — AnchorGate identity & session charter

**Status:** implemented and live-verified (Slice 6, 10 oct 2026).

This charter fixes the behavior of the owner-identity gate. It is written to be
read next to `architecture.md` (product behavior) and
`design-research/CONSTRAINTS.md` (the no-generic-UI rules).

Owner-approved inputs (09 oct 2026, recorded in `OPEN-DECISIONS.md`):

- **Owner-only** — one human identity owns the gate. No viewer/teammate accounts
  for the Nov 12 demo. The data model stays multi-user-ready (`approvedBy` /
  `rejectedBy` already exist).
- **Supabase Auth** — magic link primary, Google OAuth secondary. Privy was
  evaluated and rejected (web3 wallet infrastructure, no fit).
- **30-minute idle timeout** — enforced server-side. The number is config; the
  server-side refusal is not negotiable.

---

## 1. What the gate guarantees

| Guarantee | Where it is enforced |
|---|---|
| A person is signed in | `src/lib/auth/dal.ts` (`verifyOwner`), and optimistically in `src/proxy.ts` |
| The person is **the owner** (allowlist) | DAL + proxy + the sign-in action (before any mail) |
| The session has not been idle > 30 min | DAL + proxy, from a signed cookie |
| Decisions are stamped with the owner | request server actions (`approve`/`decline`/`pay`/`reconcile`) |
| No secret reaches the browser | Supabase **anon** key only, server-side; `service_role` is never read |

**Two layers, two jobs.** `proxy.ts` is the *optimistic* layer (fast redirects,
session refresh). The DAL is the *authoritative* layer: Next does not re-run a
layout for every nested navigation, so **every page and every Server Action**
calls `verifyOwner()` itself. The proxy is never the security boundary.

---

## 2. The identity model in one picture

```
browser ──▶ proxy.ts (refresh session · coarse policy)
              │  no session        → /signin
              │  not owner         → sign out · /signin?reason=not-owner
              │  idle / forged     → sign out · /signin?reason=timeout
              ▼
            page / server action ──▶ dal.verifyOwner()  (authoritative re-check)
              │  not owner / idle / forged → redirect /signin
              ▼
            service → core engine → (authorized) PayPal
```

The single owner address is `OWNER_EMAIL`. With no `OWNER_EMAIL` set the gate
**fails closed** — *nobody* is the owner.

---

## 3. The 30-minute idle timeout

The timeout is not trusted to the client. Each authenticated request carries a
signed, `HttpOnly` cookie `ag_seen` = `<issuedAt>.<HMAC>` where the HMAC is over
`userId.issuedAt` using `SESSION_SECRET` (`src/lib/auth/owner.ts`).

The server classifies the cookie (`assessStamp`):

| Cookie state | Meaning | Result |
|---|---|---|
| **absent** | new session (window starts now) | allowed; a fresh stamp is issued |
| **active** | valid signature, within 30 min | allowed |
| **idle** | valid signature, past 30 min | **refused**, session cleared |
| **forged** | bad signature / wrong user | **refused**, session cleared |

Why "absent" is allowed: a freshly signed-in browser has no stamp yet, and the
DAL reads the *incoming* request (the proxy sets the outgoing one). Refusing on
absence would bounce the owner straight back to `/signin`. Absence is not
evidence of idleness — it is the start of a window. A *tampered* value, by
contrast, is refused: the client cannot forge a valid stamp without
`SESSION_SECRET`, so the refusal is genuinely server-side.

`IDLE_MS` (in `src/lib/auth/owner.ts`) is the one number to change.

---

## 4. Required environment (server-side only)

| Variable | Purpose | Secret? |
|---|---|---|
| `SUPABASE_URL` | project URL | no |
| `SUPABASE_ANON_KEY` | public/anon key (safe to expose; grants no data by itself) | no |
| `SESSION_SECRET` | HMAC key for the idle stamp | **yes** |
| `OWNER_EMAIL` | the single allowed owner address | no |

Never read `SUPABASE_SERVICE_ROLE_KEY` in application code: it bypasses row-level
security. It is deliberately absent from the app.

---

## 5. Supabase dashboard configuration (one-time)

Authentication is configured in the Supabase dashboard, not in code.

1. **URL Configuration** → **Redirect URLs**: add the callback for every
   environment, e.g.
   - local: `http://localhost:3000/auth/confirm`
   - deployed: `https://<your-domain>/auth/confirm`
   Without this, Supabase falls back to the Site URL and the `code` lands on `/`
   (protected) instead of the callback. As a local convenience the proxy
   **bridges** that fallback: a `?code=` on the app root is forwarded to
   `/auth/confirm`. Configure the Redirect URLs anyway — the bridge only helps
   when the Site URL is the app origin.
2. **Site URL** (same page): the canonical app origin.
3. **Email provider** is already on. Magic link works today.
4. **Google (optional):** Authentication → Providers → Google → enable and paste
   a Google OAuth client id/secret. Until this is done, the Google button shows
   "Google sign-in is not enabled for this project yet."

---

## 6. Flow

**Magic link (primary).**
`sendMagicLink` (server action) validates the address and checks the allowlist
**before** calling `supabase.auth.signInWithOtp`. The email link lands on
`/auth/confirm`, which exchanges the PKCE `code` (or verifies a `token_hash`),
writes the session cookies, and redirects into the app. The proxy then applies
the owner + idle policy.

**Google (secondary).**
`signInWithGoogle` starts OAuth with the same `/auth/confirm` callback.

**Sign out.** The masthead's **Sign out** runs the `signOut` server action,
which clears the Supabase session and returns to `/signin`.

---

## 7. Files

| File | Role |
|---|---|
| `src/proxy.ts` | Next 16 Proxy entrypoint (matcher) |
| `src/lib/supabase/proxy.ts` | session refresh + optimistic policy |
| `src/lib/supabase/server.ts` | request-scoped Supabase server client |
| `src/lib/supabase/config.ts` | reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` |
| `src/lib/auth/owner.ts` | owner allowlist + signed idle stamp (no Next imports) |
| `src/lib/auth/dal.ts` | **authoritative** `getOwner` / `verifyOwner` |
| `src/app/(auth)/signin/` | the sign-in screen + server actions |
| `src/app/auth/confirm/route.ts` | magic-link / OAuth callback |
| `src/components/sign-in-form.tsx` | the slip (client state only) |

---

## 8. Tests

- `src/lib/auth/owner.test.ts` — allowlist; stamp sign/verify; tamper, wrong-user,
  stale, and absent cases; `assessStamp` classification.
- `src/app/(auth)/signin/actions.test.ts` — malformed and **non-owner** addresses
  are refused **without** a provider call; the owner path calls
  `signInWithOtp` with the correct callback origin; provider errors surface.

Run: `npm test`. Typecheck: `npm run typecheck`.

---

## 9. How to verify by hand

1. `npm run dev`.
2. Visit `/` while signed out → you are sent to `/signin`.
3. Submit a **non-owner** address → inline refusal, no email.
4. Submit the **owner** address → "check your inbox"; open the link on the same
   browser → you are inside the app; the masthead shows your email.
5. Leave the tab idle > 30 min, then act → refused to `/signin?reason=timeout`.
