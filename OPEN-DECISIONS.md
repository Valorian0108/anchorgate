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
- PayPal integration path: direct Orders API vs Agent Toolkit vs MCP vs other.
- AI model/provider and agent framework.
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

_None recorded yet._

------------------------------------------------------------------------

## Change log

- **Initial:** Created this record. Logged the product-name correction
  ("Trust Layer" is a placeholder). Carried forward open decisions from
  `architecture.md` section 14.
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
