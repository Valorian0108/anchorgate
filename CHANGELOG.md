# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Authorization core (Phase 2).** Deterministic engine returning
  `ALLOW` / `ASK` / `DENY` with stable reason codes, runtime validation of
  untrusted input (fail-safe), and integer minor-unit money handling.
- **Purchase lifecycle (Phase 3).** Request fingerprints, propose / approve /
  reject flow with re-check against current rules, pre-execution revalidation,
  and a pluggable storage interface with an in-memory implementation.
- **Spending accounting (Phase 3).** An event-log ledger that counts completed
  spending only from a verified capture, is idempotent by provider capture id,
  tracks reservations without counting them as spent, and derives monthly totals
  from persisted events.
- **Budget period (`utcMonthPeriod`).** The monthly window is the UTC calendar
  month, per the owner's decision.
- **Durable storage (Phase 3).** A PostgreSQL schema (Drizzle ORM) with SQL
  migrations and durable implementations of the purchase and spending stores,
  targeting Supabase. Database-level primary keys enforce capture idempotency.
  Persistence is tested against a real in-process PostgreSQL engine, including a
  close-and-reopen durability test. Also includes the **active spending-rules
  store** (single global rule set), closing the Phase 3 "persistent rules" item.
- **Purchase execution (Phase 4, core).** The only path from an authorized
  request to a real payment: re-run the deterministic authorization gate, submit
  through a provider `PaymentGateway` port, verify the provider's receipt against
  the authorized amount/currency, and record a verified capture (idempotent by
  provider capture id). Blocked, failed, and mismatched payments are never
  counted. A new `EXECUTED` request status records captured payments. Demonstrated
  with a fake gateway; the live PayPal adapter is next.
- **PayPal adapter (Phase 4).** A server-only, Sandbox-only integration using the
  official `@paypal/paypal-server-sdk`:
  - `PayPalPaymentGateway` implements the core `PaymentGateway` port and is
    called only after the authorizer permits; it charges the user's vaulted
    payment method, captures, and returns the provider receipt for verification.
  - Vault enrollment (setup token -> approval URL -> payment token) so the agent
    can pay without a human present, plus a durable **saved payment method**
    store (PostgreSQL; provider token stored server-side only).
  - Fail-safe money conversion between integer minor units and PayPal decimal
    strings, including zero- and three-decimal currencies.
  - Configuration refuses `production`, so a stray environment variable cannot
    move real money.
- **PayPal Sandbox verification runner** (`scripts/sandbox-verify.ts`,
  `npm run sandbox:verify`). One command that drives the real flow against
  PayPal Sandbox: vault enrollment (browser approval), propose → deterministic
  authorization, then authorizer-gated create + capture, receipt verification,
  and exactly-once ledger counting. Reads credentials only from the local
  `.env`; never prints secrets or the vault token.
- Project scaffold: Next.js + TypeScript, Vitest test runner.
- Engineering standards (`ENGINEERING.md`), requirements traceability
  (`TRACEABILITY.md`), decision register (`OPEN-DECISIONS.md`).

### Security

- `.gitignore` excludes environment files and build output; secrets are
  intended to stay server-side.
- Authorization is enforced server-side by design; the core is isolated from
  the AI, UI, network, and storage.
