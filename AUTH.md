# AUTH.md — AnchorGate identity & session charter

**Status:** multi-user live-verified (12 oct 2026). Email + password is the
primary path for everyone; the owner's emailed magic link still works.

This charter fixes the behavior of the identity gate. It is written to be read
next to `architecture.md` (product behavior) and
`design-research/CONSTRAINTS.md` (the no-generic-UI rules).

Owner-approved inputs:

- **Multi-user** (owner, 10 oct 2026; "go" 12 oct 2026). Every person has their
  own gate: their own rules, their own Record, their own budget gauge, their own
  vaulted card. New people start **fail-closed** — no rules means nothing can be
  approved until they set their own two numbers.
- **Supabase Auth** — email + password primary; Google OAuth secondary (console
  walkthrough with the owner still to come). Privy was evaluated and rejected
  (web3 wallet infrastructure, no fit).
- **Magic link stays owner-only.** Supabase's *built-in* email sender allows only
  **2 auth emails per hour, project-wide**, so links must not become the path
  everyone uses. The demo owner's address (`OWNER_EMAIL`) keeps its link; everyone
  else signs in with a password.
- **30-minute idle timeout** — enforced server-side. The number is config; the
  server-side refusal is not negotiable.

---

## 1. What the gate guarantees

| Guarantee | Where it is enforced |
|---|---|
| A person is signed in | `src/lib/auth/dal.ts` (`verifyOwner`), and optimistically in `src/proxy.ts` |
| A person sees **only their own data** | scoped stores (`(db, ownerId)` at construction) + Postgres RLS policies keyed on `auth.uid()` |
| The session has not been idle > 30 min | DAL + proxy, from a signed cookie |
| Decisions are stamped with the person | request server actions (`approve`/`decline`/`pay`/`reconcile`) |
| No secret reaches the browser | Supabase **anon** key only, server-side; `service_role` is never read |

**Two layers, two jobs.** `proxy.ts` is the *optimistic* layer (fast redirects,
session refresh). The DAL is the *authoritative* layer: Next does not re-run a
layout for every nested navigation, so **every page and every Server Action**
calls `verifyOwner()` itself. The proxy is never the security boundary.

**Separation is defense in depth.** The app connects as the `postgres` role, so
it scopes every query itself (via the scoped stores). The RLS policies are the
second wall: even a direct query as an authenticated user cannot read another
person's rows. See `drizzle/0005_per_user_ownership.sql`.

---

## 2. The identity model in one picture

```
browser ──▶ proxy.ts (refresh session · coarse policy)
              │  no session        → /signin
              │  idle / forged     → sign out · /signin?reason=timeout
              ▼
            page / server action ──▶ dal.verifyOwner()  (authoritative re-check)
              │  no session / idle / forged → redirect /signin
              ▼
            service(userId) → scoped stores → core engine → (authorized) PayPal
```

Any signed-in account may enter. "Owner" in this codebase means *the owner of the
current session's gate* — the person signed in right now. Each person's data is
separated by `owner_id` (their Supabase auth uuid).

---

## 3. The 30-minute idle timeout

The timeout is not trusted to the client. Each authenticated request carries a
signed, `HttpOnly` cookie `ag_seen` = `<issuedAt>.<HMAC>` where the HMAC is over
`userId.issuedAt` using `SESSION_SECRET` (`src/lib/auth/owner.ts`). The stamp is
per user id, so one browser signing in as a second person gets a second window.

The server classifies the cookie (`assessStamp`):

| Cookie state | Meaning | Result |
|---|---|---|
| **absent** | new session (window starts now) | allowed; a fresh stamp is issued |
| **active** | valid signature, within 30 min | allowed |
| **idle** | valid signature, past 30 min | **refused**, session cleared |
| **forged** | bad signature / wrong user | **refused**, session cleared |

Why "absent" is allowed: a freshly signed-in browser has no stamp yet, and the
DAL reads the *incoming* request (the proxy sets the outgoing one). Refusing on
absence would bounce a person straight back to `/signin`. Absence is not evidence
of idleness — it is the start of a window. A *tampered* value, by contrast, is
refused: the client cannot forge a valid stamp without `SESSION_SECRET`.

`IDLE_MS` (in `src/lib/auth/owner.ts`) is the one number to change.

---

## 4. Required environment (server-side only)

| Variable | Purpose | Secret? |
|---|---|---|
| `SUPABASE_URL` | project URL | no |
| `SUPABASE_ANON_KEY` | public/anon key (safe to expose; grants no data by itself) | no |
| `SESSION_SECRET` | HMAC key for the idle stamp | **yes** |
| `OWNER_EMAIL` | the one address allowed the emailed magic link | no |
| `PAYPAL_*` | Sandbox credentials (see the PayPal docs) | **yes** |

Never read `SUPABASE_SERVICE_ROLE_KEY` in application code: it bypasses row-level
security. It is deliberately absent from the app.

---

## 5. Supabase dashboard configuration (one-time)

Authentication is configured in the Supabase dashboard, not in code.

1. **Turn OFF email confirmation** (required before demo day).
   Authentication → **Sign In / Up** → **Email** → turn **Confirm email** off.
   Why this matters: with confirmation on, every sign-up must open a confirmation
   email, and the built-in sender allows only **2 emails per hour project-wide** —
   so a room of judges cannot all sign up. With confirmation off, a new account
   gets a session immediately and no email is sent. The app handles *both*
   settings honestly, so nothing breaks in the meantime; one path just says
   "check your inbox".
2. **URL Configuration** → **Redirect URLs**: add the callback for every
   environment, e.g.
   - local: `http://localhost:3000/auth/confirm`
   - deployed: `https://<your-domain>/auth/confirm`
   Without this, Supabase falls back to the Site URL and the `code` lands on `/`
   (protected) instead of the callback. As a local convenience the proxy
   **bridges** that fallback: a `?code=` on the app root is forwarded to
   `/auth/confirm`. Configure the Redirect URLs anyway — the bridge only helps
   when the Site URL is the app origin.
3. **Site URL** (same page): the canonical app origin.
4. **Google (optional, later):** Authentication → Providers → Google → enable and
   paste a Google OAuth client id/secret. Until then the Google button returns to
   `/signin?reason=provider` with a plain sentence.
5. **Password rules:** the app asks for **8+ characters**; Supabase's own minimum
   is lower, so the app is the stricter gate.

---

## 6. Flows

**Email + password (primary for everyone).**
`signUp` (server action) validates the address, the 8-character minimum and the
password match, then calls `supabase.auth.signUp`. If a session comes straight
back (confirmation off) it enrolls the Sandbox card best-effort and enters the
app; otherwise it returns the "check your inbox" beat. `signInWithPassword`
validates, calls `supabase.auth.signInWithPassword`, translates the provider's
error into one plain sentence, and on success enters the app.

**Magic link (owner only).**
`sendMagicLink` validates the address and checks `OWNER_EMAIL` **before** calling
`supabase.auth.signInWithOtp`. The link lands on `/auth/confirm`, which exchanges
the PKCE `code` (or verifies a `token_hash`), writes the session cookies, and
redirects into the app.

**Google (secondary).** `signInWithGoogle` starts OAuth with the same callback.

**Sandbox card, best-effort.** On first sign-in, `/auth/confirm` and the
password/sign-up actions call `ensureSandboxCard(userId)` (`src/lib/service.ts`).
It is **Sandbox-only**: it enrolls PayPal's public test card under the person's
own `merchantCustomerId`, so a fresh account can live the whole arc (ask,
approve, pay, see the reference) with no CLI. Any failure is swallowed on
purpose; the person can still set rules and ask, and the pay step then says its
own honest sentence. In production this would be PayPal's hosted card fields.

**Sign out.** The masthead's **Sign out** runs the `signOut` server action, which
clears the Supabase session and returns to `/signin`.

---

## 7. Files

| File | Role |
|---|---|
| `src/proxy.ts` | Next 16 Proxy entrypoint (matcher) |
| `src/lib/supabase/proxy.ts` | session refresh + optimistic policy |
| `src/lib/supabase/server.ts` | request-scoped Supabase server client |
| `src/lib/supabase/config.ts` | reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` |
| `src/lib/auth/owner.ts` | demo-owner allowlist (magic links) + signed idle stamp |
| `src/lib/auth/dal.ts` | **authoritative** `getOwner` / `verifyOwner` |
| `src/app/(auth)/signin/` | the sign-in screen + server actions |
| `src/app/(auth)/signup/` | the sign-up screen |
| `src/app/auth/confirm/route.ts` | magic-link / confirmation / OAuth callback |
| `src/components/sign-in-form.tsx` | the sign-in slip (client state only) |
| `src/components/sign-up-form.tsx` | the sign-up slip (client state only) |
| `src/lib/service.ts` | `ensureSandboxCard` + per-user service wiring |

---

## 8. Tests

- `src/lib/auth/owner.test.ts` — allowlist; stamp sign/verify; tamper, wrong-user,
  stale, and absent cases; `assessStamp` classification.
- `src/app/(auth)/signin/actions.test.ts` — password sign-in (bad input, wrong
  credentials, success + card enrollment, card failure does not block sign-in);
  sign-up (validation, already-registered, session, check-email); the magic link
  is still refused for a non-owner **without** a provider call.
- `src/infra/persistence/persistence.test.ts` — one person's requests, ledger,
  rules and card are invisible to another.
- `src/infra/paypal/vault.test.ts` — card enrollment, and the request-id length
  cap (see the note below).

Run: `npm test`. Typecheck: `npm run typecheck`.

---

## 9. How to verify by hand

1. `npm run dev`.
2. Visit `/` while signed out → you are sent to `/signin`.
3. **Create your gate** at `/signup` with an email and an 8+ character password.
   - confirmation off → you land on the Gate, signed in;
   - confirmation on → "check your inbox" (turn it off for the demo, per §5).
4. The Gate shows **no rules set yet, so nothing can be approved** — the safe
   default. Your masthead shows *your* email.
5. Set your two numbers on **Rules**; your first rule set is written as
   `owner-1`.
6. Ask the assistant for something → **needs you** (new seller) → **Decide** →
   **Approve and pay** → a paid row with a PayPal reference.
7. Leave the tab idle > 30 min, then act → refused to `/signin?reason=timeout`.

---

## 10. A hard-won gotcha: `PayPal-Request-Id` length

The vault endpoints cap the `PayPal-Request-Id` header at **38 characters** and
answer a longer id with a bare `UNKNOWN_VALIDATION` 400 that names no field. The
old ids embedded a uuid and a timestamp (55 to 61 chars) and failed; short ids
succeed every time. `vaultRequestId(prefix)` in `src/infra/paypal/vault.ts`
builds a prefix plus 16 hex characters, and `vault.test.ts` pins the cap. Do not
put an owner id or a timestamp into a PayPal request id.
