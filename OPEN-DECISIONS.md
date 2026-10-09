# Open Decisions & Corrections

**Purpose:** A running, concise record of decisions, assumptions, open questions,
and corrections so nothing gets silently forgotten or treated as approved.

**Companion to:** `architecture.md` (the source of truth for product behavior).

**Ground rule:** An item is only "decided" when the owner explicitly says so.
A proposal, a recommendation, or generated code is **not** a decision.

------------------------------------------------------------------------

## Corrections / clarifications

- **Product name:** "Trust Layer" is **not** the product name. It was an error in
  the architecture document and should be treated as a **placeholder working
  label only**. Do not bake it into code, folder names, repositories, branding,
  or user-facing text. The real name remains undecided.
- **"Agent Ready" / Agentic Commerce Protocol (ACP) is the wrong fit (finding).**
  The owner initially selected ACP for Phase 4, but a review of PayPal's actual
  docs (2026) shows Agent Ready is a **merchant-side** offering: a *store* accepts
  payments from AI assistants (ChatGPT, Gemini) through **Braintree**, with
  **gated onboarding** (a form plus review by PayPal's AI team). Our product is
  **payer-side** — a person authorizes *their* agent to spend *their* money. ACP
  would require reframing the product as a merchant store and would likely not be
  available before the deadline. Decision reversed; see Decisions. We must **not
  claim** to implement ACP/AP2 without evidence.
- **Vaulting must be enabled on the Sandbox app (observed, first live run).** The
  first `npm run sandbox:verify` attempt failed at the setup-token step with
  HTTP 403 `NOT_AUTHORIZED`. This is a PayPal configuration requirement, not a
  code defect: the app must have **Vault** enabled under **Sandbox App Settings →
  App Feature Options** (`Accept payments` + `Advanced options` → `Vault`). PayPal
  lists vaulting as supported in the US, Canada, much of Europe, Australia, and
  parts of Asia — so the earlier "US-only" note was too narrow. Also found that
  the SDK throws errors with an **empty `message`** and the real reason in
  `statusCode`/`result`; error reporting was fixed (`infra/paypal/errors.ts`).
- **Vaulted merchant-initiated orders capture on creation (observed).** For a
  payment made with a **vault** and `stored_credential.paymentInitiator =
  MERCHANT` / `usage = SUBSEQUENT`, PayPal performs the capture during **order
  creation**. A subsequent `capture` call is rejected with HTTP 422 "Order
  already captured." The adapter was corrected to treat PayPal as the source of
  truth: read a capture from create, `getOrder` when create reports `COMPLETED`
  without one, and — if a capture call is still rejected — re-read the order and
  adopt the existing capture. This preserves the "count once, from a verified
  capture" invariant and makes the payment path idempotent with respect to
  duplicate capture.
- **Vaulted PayPal-wallet captures sit in `PENDING_REVIEW` in Sandbox
  (observed).** After the duplicate-capture fix, the next live run returned an
  order of `COMPLETED` with a capture of `PENDING` and
  `statusDetails.reason = PENDING_REVIEW`. This matched the order correctly, so
  the cause was isolated by re-running against a **card** vault: the card capture
  returned `COMPLETED` immediately, while the wallet capture stayed `PENDING`
  across repeated polls and `storedCredential` variants. Conclusion: this is
  PayPal risk review for a **wallet-vault merchant-initiated** charge in Sandbox —
  **not** a defect in our code. The correct behavior is to treat it as a real
  "initiated but not settled" state: record it, do **not** count it, and
  reconcile later (see Decisions).

------------------------------------------------------------------------

## Decisions (approved by owner)

- **Authorization decision precedence (approved).** Evaluate in order: validate
  the request → deny invalid amounts (≤ 0) → deny a disallowed category → deny
  if it would exceed the monthly cap → `ASK` if above the per-purchase limit or
  another approval condition applies → otherwise `ALLOW`. The strictest answer
  wins (`DENY > ASK > ALLOW`), and hard constraints always beat approval
  conditions. A **missing or unknown category** when categories are restricted
  results in `DENY` (never treat missing rules as permission).
- **Stack: Next.js + TypeScript (full-stack, single repo).** Approved by owner as
  the implementation stack. Rationale: keeps PayPal secrets server-side by
  structure, supports real automated tests for the deterministic authorization
  engine, and is the easiest path for judges to run. Other open decisions
  (database, auth, AI model, PayPal integration path) remain deferred to their
  proper phases.
- **Render removed from the working set.** The owner asked to drop Render as a
  candidate. It will not be treated as the default hosting/backbone choice.
  Revisit only if the owner raises it again.
- **License: MIT.** Chosen so the repository can be public and open source, as
  the hackathon requires. The copyright holder is a placeholder ("The Project
  Authors") until the project name and owner details are finalized.
- **Local git repository initialized.** A repo now exists locally with an initial
  commit. No public remote/host has been chosen yet.
- **Engineering standard adopted.** The project is run as a production
  engagement: claims are backed by evidence, decisions are recorded, and
  requirements are traceable to code and tests. Governance artifacts:
  `ENGINEERING.md` (how we work), `TRACEABILITY.md` (requirements → code →
  tests), and `CHANGELOG.md`. The GitHub remote is intentionally left as-is
  for now.
- **Approval lifecycle (partly decided).**
  - A pending (`ASK`) request is **immutable**: any material change creates a
    new request that must be approved again.
  - Pending approvals **do not expire** for the MVP (revisit later).
  - At approval/execution time, the request is **re-checked against the current
    rules and budget**; if a hard constraint (e.g. the monthly cap) is no longer
    satisfied, it cannot be approved or executed.
- **Spending-accounting decisions (approved).**
  - **Refunds and reversals are out of scope for the MVP.** A refund may be
    recorded for audit, but it does not reduce the counted total for now.
  - **The budget period is the UTC calendar month** (1st 00:00:00Z inclusive →
    next 1st 00:00:00Z exclusive), implemented as `utcMonthPeriod`.
  - **Reservations are recorded but not enforced yet.** Budget-reservation
    enforcement (expiry, release, conversion) is deferred to Phase 4, to be
    decided before concurrent payment execution is enabled.
- **Durable storage: PostgreSQL via Supabase (approved).** The owner has a
  Supabase account, and Supabase is managed PostgreSQL. Durable implementations
  of the purchase and spending stores target it through Drizzle ORM.
- **A single global spending-rule set (approved, MVP).** Rules are stored as one
  active set rather than per-user. The schema can grow a tenant id when the
  identity/auth decision is made.
- **PayPal integration path: Agent Toolkit + Vercel AI SDK (approved).**
  - We use **`@paypal/agent-toolkit` (TypeScript, `ai-sdk` entry)** for PayPal
    API access and **Vercel's AI SDK** for the agent, matching our Next.js stack.
  - **Security boundary:** the agent may be given order-*creating* and read-only
    tools, but it must **never** be given `pay_order` (capture). Payment is
    performed **server-side, only after** the deterministic authorizer permits
    it. PayPal's toolkit supplies the tools; our layer decides whether money may
    move.
  - We will **not** claim to implement ACP/UCP or PayPal's gated agentic commerce
    services (see the ACP finding above).
- **Payment pre-authorization: vault once (approved).** The user saves a payment
  method once (PayPal Payment Method Tokens v3 setup-token flow). The server then
  creates + captures within the limits **we** enforce, so the `ALLOW` path can pay
  without a human present. PayPal supplies the payment rails; our deterministic
  layer supplies the mandate/cap. The vault token is stored server-side only
  (`saved_payment_methods`, UNIQUE per token) and never reaches the browser.
- **Support both payment sources; treat a pending capture as a first-class
  state (owner-approved).** Payment sources: **PayPal wallet** *and* **card**,
  selected per saved method (`sourceType`). A `PENDING` provider capture is a real
  state — recorded for audit (`CAPTURE_PENDING`, with the provider capture id) and
  **never counted** until it settles; `reconcilePendingPurchase(...)` re-reads it
  by id and counts it exactly once on settlement. For the **live green demo** we
  use a **card** vault (settles immediately in Sandbox); the wallet path is kept
  and correctly reports "pending, not counted."
- **Card enrollment is server-side for the Sandbox check (approved).** The
  verification runner enrolls PayPal's standard Sandbox test card server-side
  (no browser). This is a **Sandbox/test** convenience; in production, card data
  would be collected with PayPal hosted fields so raw card data never reaches our
  server. Recorded as a deviation-safe MVP choice, not a production payment path.
- **Identity scope: owner-only (approved, 09 oct 2026).** One human identity
  owns the gate; no read-only teammate accounts for the Nov 12 demo. The
  architecture stays multi-user-ready on purpose: decision records already carry
  `approvedBy` / `rejectedBy`, so adding viewer accounts later is additive, not a
  redesign.
- **Auth provider: Supabase Auth (approved, 09 oct 2026).** Entry: **magic link
  primary + Google OAuth** (both, free tier). **Privy evaluated and rejected**:
  it is web3/embedded-wallet infrastructure (keys, onchain login) with zero use
  in a PayPal-rail product; Supabase Auth already covers magic link, Google, and
  passkeys inside our existing stack, keeping identity and Postgres in one
  provider. No crypto claims, no second identity silo.
- **Session timeout: 30 minutes idle (approved, 09 oct 2026).** Enforced
  **server-side**: an approve/decline arriving with an expired session is refused
  no matter what the UI shows. The 30-minute number is a config value and
  trivially adjustable; the server-side refusal rule is not negotiable.
- **Sign-in comp approved (09 oct 2026).** The owner approved the owner-identity
  screen (`design-research/signin.comp.html`): wordmark-only masthead, serif
  statement "The gate opens for one human. You.", three trust lines, bordered
  sign-in slip (email → magic link primary, Google secondary), slip footer
  stating owner-only + 30-minute idle + server-side enforcement. This closes the
  five-screen comp set in the locked language (Gate · Request detail ×2 states ·
  Record · Statute · Sign-in), all owner-approved. PNG proofs saved for all six
  comps in `design-research/` (window now visible).

------------------------------------------------------------------------

## Assumptions (made to keep moving; safe to correct)

- **Money is integer minor units; no currency exchange.** Amounts are integers
  in the currency's minor units (e.g. cents). A request whose currency differs
  from the configured rules fails safe (`DENY`). Documented in the engine.
- **Authorization runs server-side.** Because of that, request fingerprints use
  a cryptographic hash (`node:crypto` SHA-256). The core is otherwise pure.
- **A materially changed request is a new request.** The fingerprint binds
  approvals to the amount, currency, payee, purpose, and category. Callers must
  assign a fresh request `id` when a material detail changes; the old approval
  no longer applies.
- **Rules tightening in flight.** If an `AUTHORIZED` request is later found to
  require approval under tightened rules, it is downgraded to
  `PENDING_APPROVAL` rather than executed. (Reversible; flagged for review.)
- **Capture idempotency is keyed on the provider capture id.** A
  `CAPTURE_VERIFIED` event's id is derived from the PayPal capture id, so a
  replayed callback cannot double-count spending even if it arrives with a
  different envelope id.
- **The monthly period is caller-supplied.** Spending totals are computed for an
  explicit `[start, end)` window; the ledger does not assume a timezone or a
  reset rule, leaving that (open) decision to configuration.
- **Drizzle ORM as the Postgres access layer.** Lightweight, TypeScript-native,
  with migration tooling. Domain code is unchanged: it still uses the
  `PurchaseStore` / `SpendingStore` interfaces.
- **Persistence tests use PGlite.** A real in-process PostgreSQL engine runs the
  same migrations, so the suite needs no external database while still exercising
  real PostgreSQL behavior, including a close-and-reopen restart test.
- **Accepted, documented dev-only advisory.** `npm audit` reports 4 moderate
  advisories from `drizzle-kit`'s transitive dev tooling (an old `esbuild`). They
  affect only migration generation, not the runtime; the offered fix is a
  breaking downgrade of Drizzle Kit, so it is accepted and recorded.
- **Sandbox verification uses a one-shot, in-memory vault (tool only).** The
  `npm run sandbox:verify` runner completes vault enrollment and immediately pays
  in the same process using an in-memory `PaymentMethodStore`, so the live check
  needs no database. The running application persists vault tokens durably in
  PostgreSQL (`saved_payment_methods`). This simplification applies only to the
  verification tool.
- **The `npm run purchase` CLI is the interim operator surface (assumption).**
  Until the UI is designed and approved (Phase 6), reviewing, approving, and
  paying happen through `scripts/purchase.ts`. It composes the SAME deterministic
  core, durable stores, and authorizer-gated PayPal path the UI will use; it is a
  thin surface, not a second code path for money. The UI decision remains open.
- **Supabase connections use the shared pooler.** The Supabase **Direct
  connection is IPv6-only** and is unreachable from IPv4-only networks, so both
  `DATABASE_URL` (app) and `DATABASE_URL_DIRECT` (migrations) use the shared
  **Session pooler** (IPv4, port 5432). Session mode supports prepared statements
  and session state, so migrations work; the app disables prepared statements for
  pooling anyway. The transaction pooler (port 6543) remains the eventual choice
  for a high-traffic serverless deployment.

------------------------------------------------------------------------

## Open decisions (awaiting owner)

Carried forward from `architecture.md` section 14. Grouped so we can tackle them
at useful decision points rather than all at once.

### Product and UI

- Final product name/branding.
- Visual direction, colors, typography, density, navigation, page structure,
  component style.
- The core design concept for communicating the product's distinctive idea
  (independent authorization) rather than a generic fintech dashboard.
- First-time user journey and the essential screens for the MVP.
- Whether initial agent behavior is a narrowly scripted demo or a more
  open-ended purchase-proposal flow.

### Authorization and accounting

- Exact category taxonomy (the actual list of permitted categories). Category
  violations are decided to `DENY` (see Decisions).
- ~~Approval expiration~~ ✅ resolved: no expiry for the MVP.
- ~~Pending approvals when rules/budget change~~ ✅ resolved: re-check against
  current rules; a hard constraint can never be overridden.
- ~~Monthly period timezone and reset semantics~~ ✅ resolved: UTC calendar month.
- Treatment of refunds, reversals, failed captures, reservations, abandoned
  orders — partly resolved: failed/cancelled/abandoned are never counted;
  refunds/reversals are out of scope for the MVP; reservation **enforcement** is
  deferred to Phase 4.
- ~~Concurrency and budget-reservation policy~~ ✅ deferred to Phase 4 by
  decision.

### Architecture and operations

- ~~Repository stack~~ ✅ resolved: Next.js + TypeScript (full-stack, single repo).
- ~~PayPal integration path~~ ✅ resolved: **Vercel AI SDK + an OpenAI-compatible
  provider** for the agent. Agent Ready/ACP evaluated and rejected as merchant-
  side, Braintree-based, and gated (see the ACP finding). Note (deviation, below):
  the agent is given **no PayPal tools at all** — its only tool is
  `propose_purchase`. PayPal execution stays in the server SDK, behind the
  authorizer.
- ~~AI model/provider~~ ✅ resolved: the owner's key is from **Experiential Labs**
  (`https://platform.experientiallabs.ai`), an OpenAI-compatible **gateway/router**
  (`https://api.experientiallabs.ai/v1`), so the AI SDK's OpenAI-compatible
  provider (`@ai-sdk/openai-compatible`) is used. The specific **model id** is
  chosen locally via `AGENT_MODEL` (list with `npm run agent:models`), so no model
  name is hard-coded.
- ~~Payment pre-authorization model~~ ✅ resolved: **vault a payment method once**
  (owner decision), then server-initiated create + capture within enforced
  limits. Implemented in `infra/paypal/vault.ts`; token stored server-side only.
- ~~Database/persistence technology~~ ✅ resolved: PostgreSQL via Supabase, with
  Drizzle ORM (see Decisions).
- User authentication and identity model.
- Deployment target, logging/monitoring, and data retention.

------------------------------------------------------------------------

## Sponsor / partner tool candidates (working set)

These are **candidates to evaluate and filter**, not approvals. We will narrow
this list as the scope of the build firms up, keeping only tools that fill a
genuine slot instead of being bolted on.

**Filtering test:** does the product have a hole that is *literally shaped like*
this tool? If we'd have to carve out a special place for it, it's a patch — cut
it.

**Working set:**

| Tool | The slot in this product | Status |
|---|---|---|
| **AG Grid** | Decision ledger, rules table, approval queue, spend-vs-cap view — the tables are a primary product surface | Candidate — strong |
| **Postman** | Mock PayPal responses + test our own authorization API + monitor endpoints (spec requires mocked *and* Sandbox tests) | Candidate — strong |
| **Channel3** | Where the agent's purchase intentions come from (agentic-commerce supply side) | Candidate — needs scope approval |
| **Astropods** | Agent runtime + scoped permissions + run-level audit (NOT the payment authorization brain) | Candidate — boundary-sensitive |
| **APIMatic** | Typed, generated contract (SDK/MCP) for the agent→authorization interface | Candidate — optional |
| **Zapier** | Route `ASK` approvals to Slack/email and log the action | Candidate — conditional |
| **KERNEL** | Verified merchant/payee + corporate-entity checks | Candidate — only if B2B |
| **Elastic** | Searchable decision/audit archive | Candidate — only if showcased; risks over-engineering |
| **Bryntum** | Scheduling/Gantt/calendar — no natural slot in this product | Candidate — likely cut |

**Removed from the working set:** Render (see Decisions above).

**Open decision:** final selection of sponsor tools, and how each is used
(the hackathon submission requires identifying tools and explaining how they
were used).

------------------------------------------------------------------------

## Deviations from the approved plan

- **Deviation (Phase 5): the agent does not receive the PayPal Agent Toolkit.**
  The approved integration path named the PayPal Agent Toolkit + Vercel AI SDK,
  with the hard rule that the agent must never be given `pay_order`. Building
  Phase 5, we took the stricter reading: the agent is given **no PayPal tools at
  all** — its only tool is `propose_purchase`, which calls the local
  deterministic engine. Handing the model PayPal "create order" or even read
  tools adds attack surface (and a way to smuggle payment intent) with no benefit
  for the MVP, whose agent only turns a request into a structured proposal.
  PayPal execution remains in the server SDK, behind the authorizer, exactly as
  decided. The framework half of the decision (Vercel AI SDK) is unchanged. The
  Agent Toolkit can be revisited if the agent later needs read-only merchant/
  product context; it must never include `pay_order`.

------------------------------------------------------------------------

## Change log

- **Initial:** Created this record. Logged the product-name correction
  ("Trust Layer" is a placeholder). Carried forward open decisions from
  `architecture.md` section 14.
- **Product decisions (design phase, owner input):** Working product name
  **AnchorGate** (owner's suggestion; adopted as the working name; a quick
  trademark/collision check is still owed before the public submission).
  Target audience: **small business / team**. A **login is in scope** for the
  MVP and must be implemented professionally (structured plan, not a tacked-on
  build); the identity *model* (single-owner vs. per-user data) remains open and
  is **parked** — it does not block the design work, and it leans toward
  multi-user given the team audience. The UI build process is approved as:
  **anti-generic, multi-disciplinary (creative direction, information
  architecture, visual design, engineering), and incremental** — every screen
  and material choice is decided one at a time before it is built, and design
  (`DESIGN.md`) + identity (`AUTH.md`) charters are agreed **before any code**.
- **Update:** Removed Render from the working tool set (owner decision). Added
  the remaining sponsor/partner tools as a candidate working set to be filtered
  against scope over time.
- **Update:** Owner approved the implementation stack: **Next.js + TypeScript**
  (full-stack, single repo). Logged a proposed authorization decision
  precedence awaiting confirmation.
- **Update:** Owner approved the authorization decision precedence (strictest
  answer wins; missing/unknown category → `DENY`). Moved it into Decisions.
  Started Phase 2 (authorization core).
- **Update:** Phase 2 scaffolded. Implemented the deterministic authorization
  engine (`src/core/authorization/`), runtime validation of untrusted input, and
  a test suite mapped to the spec's section 11.1 acceptance criteria. Documented
  the assumption that money is handled as integer minor units with no currency
  exchange (currency mismatch fails safe). Full Next.js shell, database, PayPal
  execution, AI agent, and UI remain unbuilt.
- **Update:** Phase 2 verified. `npm test` → 23/23 passing; `npm run typecheck`
  clean. Renamed the Vitest config to `.mts` to silence an ESM warning.
- **Update:** Repo groundwork done. Added an MIT `LICENSE`, a `.gitattributes`
  for consistent line endings, and initialized a local git repository with an
  initial commit. License choice recorded under Decisions.
- **Update:** Phase 3 (approval lifecycle) implemented. Added request
  fingerprints, the propose/approve/reject lifecycle with re-check against
  current rules, pre-execution revalidation, and a pluggable storage interface
  with an in-memory implementation. Tests: 42 passing (23 engine + 19
  lifecycle); typecheck clean. Durable storage, spending accounting, PayPal
  execution, the AI agent, and the UI remain unbuilt.
- **Update:** Adopted a production-grade engineering standard. Added
  `ENGINEERING.md` (standards, phase gates, security checklist),
  `TRACEABILITY.md` (requirements mapped to code and tests), and `CHANGELOG.md`.
  Recorded that AG Grid and other sponsor tooling are **not** implemented and
  belong to Phase 6 (UI), which is gated on a design discussion.
- **Update:** Spending accounting implemented (Phase 3). Added an event-log
  ledger (`src/core/spending/`) that counts completed spending only from a
  verified capture, is idempotent by provider capture id, tracks reservations
  without counting them as spent, and derives monthly totals from persisted
  events over an explicit period. Tests: 57 passing (23 authorization + 19
  lifecycle + 15 spending); typecheck clean. Reservations are **not** wired into
  the engine yet — the reservation policy is still open. Refunds/reversals,
  monthly reset timezone, and the concurrency/reservation policy remain open
  (see below).
- **Update:** Owner decided the spending-accounting edge cases: refunds/reversals
  are out of scope for the MVP; the budget period is the UTC calendar month;
  reservation enforcement is deferred to Phase 4. Implemented `utcMonthPeriod`
  with tests (suite now 61 passing). Open decisions updated to show resolutions.
- **Update:** Durable storage implemented (Phase 3). Chose **PostgreSQL via
  Supabase** with **Drizzle ORM** (documented). Added the database schema, SQL
  migrations (`drizzle/`), durable purchase/spending stores, and an `.env.example`
  with placeholders. Persistence is tested against **PGlite** (a real in-process
  PostgreSQL engine), including a close-and-reopen restart test. Suite now 68
  passing; typecheck clean. Recorded an accepted dev-only advisory in
  `drizzle-kit`. Secrets remain server-side and are never requested in chat.
- **Correction & resolution:** Added traceability row **C9** — *persistent,
  user-definable spending rules* — which Phase 3 requires (§2.9). It was initially
  not implemented. It is now **Done**: the owner chose a **single global rule set**
  (documented as an MVP assumption; the schema can grow a tenant id later). Rules
  are stored in PostgreSQL and re-validated on read. Suite now 71 passing.
- **Correction & decision:** Reviewed PayPal's actual 2026 documentation. Found
  that **Agent Ready / ACP** is a merchant-side, Braintree-based, gated offering
  that does not fit our payer-side product (logged as a finding). Owner reversed
  the Phase 4 choice; approved **PayPal Agent Toolkit (TypeScript) + Vercel AI
  SDK**. Recorded the hard security boundary: the agent never receives
  `pay_order`; payment is server-side and authorizer-gated. Also verified the
  real-world payment model: server-initiated payment requires a **vaulted payment
  method** (or per-order buyer approval), now logged as an open decision.
- **Update:** Phase 4 PayPal adapter implemented. Owner chose **vault a payment
  method once**. Added: the authorizer-gated execution core (Phase 4, fakes);
  `@paypal/paypal-server-sdk` adapter (`infra/paypal/`: SDK ports, Sandbox-only
  config that refuses production, create+capture gateway against the vault,
  setup-token vault enrollment, fail-safe money conversion); and a durable
  `saved_payment_methods` store (PostgreSQL, UNIQUE provider token). Suite now
  109 passing; typecheck clean. The adapter is unit-tested with fakes; a **real
  Sandbox run is still pending** and is the next Phase 4 step.
- **Update:** Added the **Sandbox verification runner** (`scripts/sandbox-verify.ts`,
  `npm run sandbox:verify`) so the real Phase 4 run is one command. It performs
  vault enrollment (browser approval) and then the real propose → authorize →
  create + capture → verify → count-once flow against Sandbox, reading secrets
  only from the local `.env` and never printing them or the vault token. Added
  `tsx` as an explicit dev dependency (it was previously only transitive, via
  Vitest/Drizzle Kit) and included `scripts/` in the typecheck. Suite remains
  109 passing; typecheck clean. The real Sandbox run is now **blocked only on the
  owner's Sandbox credentials**.
- **Update (first live run + fix).** The owner supplied Sandbox credentials and
  ran `npm run sandbox:verify`. The run reached the real API and returned HTTP 403
  `NOT_AUTHORIZED` at the setup-token step, because **Vault was not enabled** on
  the Sandbox app (see the finding above). Two fixes: (1) the verification tool
  and README now instruct enabling **Vault** under App Feature Options, and
  detect a misnamed env file (`.env.txt`); (2) provider errors now surface the
  HTTP status and structured reason via `describePayPalError`
  (`infra/paypal/errors.ts`), since the SDK throws empty-message errors. Added 6
  tests for the describer.
- **Update (second live run + fix).** After enabling Vault, the run succeeded
  through vault enrollment and authorization (**ALLOW / WITHIN_LIMITS**), then
  failed at capture with HTTP 422 "Order already captured." Root cause: for a
  **vaulted, merchant-initiated** payment, PayPal captures during order
  **creation**, so our explicit capture is a duplicate. The gateway now treats the
  provider as the source of truth: it reads a capture returned by create, calls
  `getOrder` when creation reports `COMPLETED` without one, and recovers from a
  rejected duplicate capture by re-reading the order. Added 3 gateway tests
  (12 total). Suite now **118 passing**; typecheck clean. Re-run pending.
- **Update (third live run + decision).** After the duplicate-capture fix, the
  live run reached capture but PayPal returned `PENDING` /
  `PENDING_REVIEW` for a **vaulted PayPal-wallet** charge (order `COMPLETED`).
  Diagnosed by contrast: a **card** vault captures `COMPLETED` immediately, and
  the wallet stayed `PENDING` across repeated polls. Owner decided: **support both
  sources; use a card vault for the live green demo; treat `PENDING` as a real,
  non-counted state.** Implemented: `sourceType` on saved methods + `source_type`
  column and migration; the gateway charges `payment_source.card` or
  `payment_source.paypal`; a `PENDING` outcome + `PENDING_SETTLEMENT` request
  status; `CAPTURE_PENDING` audit events; and read-only
  `reconcilePendingPurchase(...)` (counts exactly once on settlement). The runner
  now enrolls a card by default (`--wallet` for the wallet path) and reconciles
  once. **Observed live PASS (card):** decision `ALLOW`, execution `CAPTURED`,
  capture id `4GR46789K0392653X`, ledger `capturedMinor = 100` (counted once).
  Suite now **132 passing**; typecheck clean.
- **Update (durable storage live-verified).** Wired the project to a Supabase
  PostgreSQL database. Fix: `drizzle-kit` does not read `.env`, so `db:migrate`
  now loads it (Node 20.12+, guarded). Finding: the Supabase **Direct connection
  is IPv6-only** and `ENOTFOUND` on an IPv4-only network, so both connection
  variables use the shared **Session pooler**. Observed: `npm run db:migrate`
  applied all migrations, and a new **`npm run db:check`** (`scripts/db-check.ts`)
  reported all 5 tables present and reachable. Also recorded the common footgun of
  leaving the literal `[YOUR-PASSWORD]` brackets around the password in `.env`.
- **Update (AI agent, Phase 5).** Owner confirmed the key is from **Experiential
  Labs** and gave the base URL `https://api.experientiallabs.ai/v1`. Verified from
  the provider's public repo that it is an OpenAI-compatible **gateway/router**,
  so the agent uses the **Vercel AI SDK** with
  `@ai-sdk/openai-compatible`. Built a **proposal-only** agent: `src/agent/`
  (env config, model, deterministic `ProposalService`, the single
  `propose_purchase` tool, and the `generateText` composition), plus
  `npm run agent` (CLI) and `npm run agent:models` (lists model ids using the
  local key, so no key is pasted anywhere). Safety: the model gets exactly one
  tool and no payment tool; the tool returns the engine's verdict unchanged;
  config errors name missing variables but never values. Proposals persist to the
  durable database when `DATABASE_URL` is set (in-memory otherwise) and emit an
  informational `PROPOSED` ledger event. Recorded the **deviation**: the agent
  does not receive the PayPal Agent Toolkit (see Deviations). Model id is set
  locally via `AGENT_MODEL`. Added 18 tests (single-tool guarantee, deterministic
  decisions, fail-safe config). Suite now **150 passing**; typecheck clean. A
  **live model call is the next step** and needs the owner's key in `.env`.
- **Update (AI agent live-verified; model chosen; budget).** Owner asked to stay
  on budget models. Set **`AGENT_MODEL=deepseek-v4-flash`** and ran the agent
  against the durable database: `"buy a 49 dollar software license from Acme"`
  -> the model called `propose_purchase` and the engine returned **ASK**
  (`APPROVAL_REQUIRED`; `PENDING_APPROVAL`); `"buy a 5000 dollar software
  license from Beta Corp"` -> engine **DENY** (`MONTHLY_CAP_EXCEEDED`;
  `DENIED`). `npm run db:check` then showed the writes persisted:
  `purchase_requests` 2, `evaluations` 2, `spending_events` 2,
  `spending_rules` 1. The first live run seeded the clearly-labelled `demo-1`
  rule set (hard $200/month cap; categories `software`, `office_supplies`,
  `books`, `hardware`; new payees require approval) because the database had no
  active rules.
  **Model compatibility check (observed, budget class):** tool calling worked
  for `deepseek-v4-flash`, `deepseek-v4.1-flash`, `glm-5.3-flash`, `gpt-5-nano`,
  `gpt-5-mini`, `gpt-4.1-mini`, `gemini-2.5-flash`, `gemini-3.5-flash-lite`,
  `qwen3.6-flash`, `minimax-m2.5`, `seed-1.6-flash`, and `claude-haiku-4.5`.
  Two failures were **account/profile**, not capability: `glm-5.2-fast` requires
  the workspace's own provider key (BYOK not connected), and `gpt-oss-20b`'s
  gateway profile does not enable the `tools` capability. **Owner action
  (optional):** the `demo-1` rules can be replaced with real limits at any time.
- **Update (owner spending rules set).** Added a reusable rules admin CLI
  (`scripts/rules.ts`, `npm run rules:show` / `npm run rules:set`). Amounts are
  accepted in major units and converted to integer minor units; input fails
  closed; the command requires the durable database. Replaced the demo rules
  with the owner's real limits, stored as **`owner-1`**: currency **USD**,
  automatic per-purchase limit **$50**, hard monthly cap **$100**, categories
  `software`, `office_supplies`, `hardware`, `books`, `cloud_services`,
  `advertising`, `travel`, `meals`, and first-time-payee approval **on**.
  Live-confirmed with the agent: a **$150** request -> engine **DENY**
  (`MONTHLY_CAP_EXCEEDED`); a **$75** request -> **ASK**
  (`PER_PURCHASE_LIMIT_EXCEEDED`); a **$40 travel** booking from a new payee ->
  **ASK** (`APPROVAL_REQUIRED`), proving the new category is permitted.
- **Update (end-to-end flow wired and live-verified).** Built the application
  layer (`src/services/`): `PurchaseService` composes the deterministic core with
  the durable stores and the (lazily built) PayPal gateway, and
  `readSpendingState` became the single source of truth for the facts the engine
  evaluates against (verified spend this UTC month + known payees), shared by the
  agent's proposal path and the approval/execution path. Added the operator CLI
  `npm run purchase` (`scripts/purchase.ts`): `budget`, `pending`, `list`,
  `show`, `approve` (optionally `--pay`), `reject`, `pay`, `reconcile`, `enroll`,
  `payments`. It records `APPROVED` / `REJECTED` / `DENIED` audit events and
  prints the engine's evaluations and the ledger. **Observed live, durable:**
  agent proposed `$1` to a first-time payee -> `ASK` (`APPROVAL_REQUIRED`); owner
  approved; `pay` returned `CAPTURED` via the vaulted card (capture
  `00053762B0399214K`, `1.00 USD`) and counted it once; a second `pay` was
  `BLOCKED` (`EXECUTED`) with no double-count; a fresh process read `spent 1.00 /
  remaining 99.00` from the database. Added 11 service tests. Suite now **161
  passing**; typecheck clean. Recorded the interim-CLI assumption above.
- **Update (Phase 6 design direction locked — "Ledger & Print").** Comps v1–v3
  were pulled after the owner refused the "generic AI dashboard" feel. Research
  against builder-endorsed anti-slop guidance (Anthropic's frontend-aesthetics
  cookbook/skill, Hallmark's 58-gate slop test — 12k+ stars, Adam Wathan's
  Tailwind `indigo-500` apology, Refactoring UI, Laws of UX) produced a
  named-tell audit of the comps (~10 tells, several critical: indigo accent,
  Space Grotesk + Inter, per-section eyebrows, colored side stripes, invented
  metrics, "Acme" placeholder, unmixed tokens, weak small-text contrast). The
  owner approved the direction: **Ledger base + print signature + whisper of
  instrument**. The **indigo accent is retired**; references to study are set
  (Mercury · Stripe · Bloomberg spirit · FT/Economist print · Stripe Press);
  **no comps until the constraint doc (tokens + type + bans + structure) is
  studied, written, and approved**. Logged in `DESIGN.md` § 7c.
- **Update (UI slices 1–3 wired and live-verified).** Built the Next.js app
  against the live backend, slice by slice: **Slice 1** foundation + live Gate;
  **Slice 2** the request-detail case file with real server-side approve/decline;
  **Slice 3** the real PayPal capture.
  - The pending slip's primary action is **"Approve & pay"** (the comp's wording,
    restored once capture existed): the server action approves (engine re-check)
    and then executes. If the engine refuses at approval (e.g. the cap no longer
    holds), **no payment is attempted**.
  - An `APPROVED` record exposes a **Pay** action — also the retry path after a
    provider failure.
  - `PENDING_SETTLEMENT` is now a first-class "Capturing — settling" state with a
    read-only **Re-check with PayPal** (`reconcile`); it never re-pays.
  - Accuracy fixes on the case file: receipt step 02 shows the **proposal**
    verdict (not the latest); an already-`EXECUTED` record no longer adds its
    amount to the cap a second time; and an ASK→ALLOW move during execution is
    described as the **facts moving** (a human cleared the ASK), not as "the
    engine changed its answer."
  - Durable enrollment: added `scripts/vault-card.ts` (`npm run vault:card`,
    facts-only; `--enroll` vaults the Sandbox test card into
    `saved_payment_methods`) because `sandbox:verify` vaults into an in-memory
    store, not the app's durable store. The vault token is never printed.
  - **Observed live, through the app's own button:** the agent proposed **$1** to
    a first-time payee (Vercel Inc) → **ASK** (`APPROVAL_REQUIRED`); **Approve &
    pay** approved and captured via the vaulted card → `EXECUTED`, capture ref
    `0YK4105449848211V`, counted once; the Gate posture moved to
    `captured 42.00`. A prior live capture (`Expedia 40.00`, ref
    `6D377252179999139`) is also in the ledger. Suite **161 passing**; typecheck
    clean. Supabase Auth (`SUPABASE_URL` + anon key) is the only thing still
    blocking the sign-in slice.
- **Update (slices 4–5 — the Record and the Statute, live).** The two remaining
  placeholder screens now render from the store, ported from their approved
  comps:
  - **Record** (`/record`) — the audit register. One row per request, newest
    first, with a decision trail rebuilt from that record's own evaluations
    (proposal verdict → what the owner did → where it landed), the current
    standing chip, the amount, and proof (capture ref when a `CAPTURE_VERIFIED`
    event exists, plus the short fingerprint). A live integrity strip states the
    hard cap, that counting is from verified captures only, that the engine takes
    no approvals from the model, and that rows are written once. Totals foot the
    register (requests · outstanding; captured · reserved · cap · headroom).
  - **Statute** (`/statute`) — the rule set. Eight clauses with the **live**
    values (rule version, currency, the permitted-category list, the cap, the
    per-purchase line, whether the new-payee rule is on), the fixed decision
    order, and "strictest wins: DENY > ASK > ALLOW". When no rule set is
    configured it renders the fail-closed notice instead of inventing rules.
  - Added a single bulk ledger read (`PurchaseService.allEvents()`,
    `SpendingStore.list()`) so the register reads all events in one query rather
    than per row. Shared display helpers `shortId` / `shortRef` /
    `shortFingerprint` (`lib/format.ts`) and `reasonPhrase` (`lib/vocab.ts`); the
    request-detail page now uses the shared `shortRef`.
  - **Observed live:** `/record` rendered **7 requests** with real capture refs
    (`0YK41054…`, `6D377252…`) and the correct posture (`captured 42.00 ·
    reserved 124.00 · cap 100.00 · headroom 0.00`); `/statute` rendered rule set
    `owner-1` (USD · auto-allow 50.00 · cap 100.00 · 8 categories · new payee →
    ask). Suite **162 passing**; typecheck clean.
  - Note: the dev server was cycling `500`s from the **known Supabase session-pool
    ceiling** (`EMAXCONNSESSION`, pool_size 15) accumulated by a long-lived HMR
    process — not a page defect; a fresh server cleared it.
