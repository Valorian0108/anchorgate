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

------------------------------------------------------------------------

## Assumptions (made to keep moving; safe to correct)

_None recorded yet._

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
- Approval expiration; behavior of pending approvals when rules or budget change.
- Monthly period timezone and reset semantics.
- Treatment of refunds, reversals, failed captures, reservations, and abandoned
  orders.
- Concurrency and budget-reservation policy for simultaneous requests.

### Architecture and operations

- Repository stack; how implementation should fit it (greenfield at time of
  writing — no code exists yet).
- PayPal integration path: direct Orders API vs Agent Toolkit vs MCP vs other.
- AI model/provider and agent framework.
- Database/persistence technology.
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
