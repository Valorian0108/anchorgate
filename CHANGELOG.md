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
  - **Card or PayPal-wallet payment sources.** A saved method records its
    `sourceType` (`"paypal"` or `"card"`), and the gateway charges the matching
    `payment_source`. A card can be enrolled **server-side** (Sandbox test card)
    with no browser step, which is the path used for the live green check; the
    PayPal-wallet path keeps the browser approval.
  - **Pending captures are handled honestly (not counted, not lost).** A provider
    capture that is initiated but not settled (`PENDING`) is recorded for audit
    (`CAPTURE_PENDING`, carrying the provider capture id) and **never counted**. A
    new request status `PENDING_SETTLEMENT` marks the request, and
    `reconcilePendingPurchase(...)` re-reads the capture by id (read-only) and
    counts it **exactly once** when it settles (or records a failure if it
    declines). This is real Sandbox behavior for vaulted PayPal-wallet payments
    (`statusDetails.reason = PENDING_REVIEW`).
- **PayPal Sandbox verification runner** (`scripts/sandbox-verify.ts`,
  `npm run sandbox:verify`). One command that drives the real flow against
  PayPal Sandbox: enroll a payment source, propose → deterministic authorization,
  then authorizer-gated create + capture, receipt verification, and exactly-once
  ledger counting. `--wallet` (or `npm run sandbox:verify:wallet`) uses a PayPal
  wallet with browser approval; the default uses a server-side Sandbox test
  **card**, which settles immediately. When the provider holds a capture as
  `PENDING`, the runner reconciles once and reports the result. Reads credentials
  only from the local `.env`; never prints secrets or the vault token.
- **Database health check** (`scripts/db-check.ts`, `npm run db:check`). Confirms
  the durable database is reachable and migrated: prints the tables and their row
  counts, and exits non-zero if a required table is missing. Never prints the
  connection string or any credential.
- **AI agent (Phase 5).** A proposal-only agent built on the **Vercel AI SDK**
  with an **OpenAI-compatible** provider (`@ai-sdk/openai-compatible`), targeting
  Experiential Labs' OpenAI-compatible gateway (any compatible endpoint works via
  `AGENT_BASE_URL`). It exposes **exactly one tool, `propose_purchase`** — there
  is no payment, capture, refund, or approval tool. The tool calls the existing
  deterministic engine and returns its `ALLOW` / `ASK` / `DENY` verdict
  unchanged; the agent is instructed that it cannot approve or pay and that the
  decision is final. Proposals are recorded durably (a purchase record plus an
  informational `PROPOSED` ledger event), and the active rules are described to
  the model so it can make plausible suggestions. Configuration reads
  `AGENT_API_KEY` / `AGENT_MODEL` / `AGENT_BASE_URL` from the local environment
  and reports missing variable **names** only — never values.
- **Agent CLI** (`scripts/agent-cli.ts`, `npm run agent`) and **model lister**
  (`scripts/agent-models.ts`, `npm run agent:models`). The CLI turns a natural-
  language request into a proposal and prints the engine's decision; it uses the
  durable database when `DATABASE_URL` is set and an in-memory store otherwise.
  The model lister calls the configured endpoint with your local key and prints
  the available model ids, so no key ever needs to be pasted anywhere.
- **Purchase application service & runnable end-to-end flow (Phase 4
  completion).** The pieces that existed separately (propose, approve, pay, count)
  are now wired into one flow:
  - `src/services/` composes the deterministic core with the durable stores and
    the payment gateway. `PurchaseService` exposes `budget`, `listPending`,
    `approve`, `reject`, `pay` (with optional pending reconciliation), and
    `reconcile`. It contains no policy of its own: every decision is the core's.
    The gateway is built lazily, so read/approval commands work without PayPal
    credentials.
  - `readSpendingState` is the SINGLE place that computes the facts the engine
    evaluates against (verified spend this UTC month, and the payees the owner has
    previously approved or paid). It is used by both the agent's proposal path and
    the approval/execution path, so the two can never disagree.
  - `npm run purchase` (`scripts/purchase.ts`) is the operator surface: `budget`,
    `pending`, `list`, `show <id>`, `approve <id>` (optionally `--pay`),
    `reject <id>`, `pay <id>`, `reconcile <id>`, `enroll` (vault a payment
    method), and `payments`. It prints the engine's evaluations and the ledger
    events, and never prints credentials or vault tokens.
  - `approve` re-checks the current rules/budget (the monthly cap still cannot be
    overridden), and `pay` re-runs the final deterministic gate before touching
    PayPal. A verified capture is counted exactly once, so a repeated `pay` is
    `BLOCKED` and does not double-count.
- **In-memory rules store** (`InMemorySpendingRulesStore`), matching the existing
  in-memory purchase and spending stores, for tests and local runs.
- Project scaffold: Next.js + TypeScript, Vitest test runner.
- Engineering standards (`ENGINEERING.md`), requirements traceability
  (`TRACEABILITY.md`), decision register (`OPEN-DECISIONS.md`).

### Fixed

- **PayPal provider errors reported nothing.** The PayPal SDK throws errors whose
  `message` is often empty, with the real reason in `statusCode` and a structured
  body — so the first live Sandbox failure printed no explanation. A new
  `describePayPalError` (`infra/paypal/errors.ts`) surfaces the HTTP status, error
  code, message, and PayPal `debug_id` (never credentials or request data), and
  is used by both the gateway and the verification runner.
- **Duplicate capture on vaulted payments.** Vaulted merchant-initiated orders can
  be captured by PayPal during order creation, so the follow-up capture was
  rejected with HTTP 422 "Order already captured." The gateway now reads the
  capture from the create response, fetches the order with `getOrder` when
  creation reports `COMPLETED` without a capture, and recovers from a rejected
  duplicate capture by re-reading the order — counting spending only from the
  provider's verified capture.
- **A `PENDING` capture was reported as a failure.** A vaulted PayPal-wallet
  capture in Sandbox is initiated but held for review (`PENDING_REVIEW`); the
  gateway previously classified any non-`COMPLETED` capture as `FAILED`. It is now
  a distinct `PENDING` outcome, recorded for audit and excluded from spending
  until the provider settles it.
- **`db:migrate` ignored `.env`.** `drizzle-kit` does not load `.env` on its own,
  so migrations saw empty credentials even after Supabase was configured. The
  migration config now loads `.env` itself (Node 20.12+), guarded by a file check
  so CI can still supply real environment variables.

### Security

- `.gitignore` excludes environment files and build output; secrets are
  intended to stay server-side.
- Authorization is enforced server-side by design; the core is isolated from
  the AI, UI, network, and storage.
- The agent's tool set is constructed in one place and asserted (in tests) to
  contain only `propose_purchase`; no payment tool is ever handed to the model,
  and credentials are never passed to it or printed.
