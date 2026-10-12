# Requirements Traceability Matrix

Maps each requirement from `architecture.md` to where it is implemented and
tested. Status legend: **Done** · **Partial** · **Pending** · **N/A**.

No requirement is marked **Done** without a passing test or observed result. The
test suite is run with `npm test`.

------------------------------------------------------------------------

## Authorization behavior

| # | Requirement (source) | Implementation | Tests | Status |
| --- | --- | --- | --- | --- |
| A1 | Outcomes are `ALLOW` / `ASK` / `DENY` (§1, §5) | `src/core/authorization/types.ts` | `engine.test.ts` | Done |
| A2 | Decisions come from deterministic logic, not the AI (§1, §5.3) | `src/core/authorization/engine.ts` | `engine.test.ts` (determinism) | Done |
| A3 | AI cannot set/edit/override authorization (§5.3) | Engine has no AI dependency; pure function | `engine.test.ts` | Done |
| A4 | Deny invalid amounts (≤ 0) (§5.2) | `engine.ts` | `engine.test.ts` | Done |
| A5 | Deny if it would exceed the monthly cap (§5.2) | `engine.ts` | `engine.test.ts` | Done |
| A6 | `ASK` if above the per-purchase limit (§5.2) | `engine.ts` | `engine.test.ts` | Done |
| A7 | Disallowed category cannot be paid (§5.2, §11.1) | `engine.ts` | `engine.test.ts` | Done |
| A8 | Missing/unknown category fails safe (§5.3, §11.1) | `validation.ts`, `engine.ts` | `engine.test.ts` | Done |
| A9 | Strictest answer wins (`DENY` > `ASK` > `ALLOW`) (§5.2) | `engine.ts` (order) | `engine.test.ts` | Done |
| A10 | Missing/malformed/unsupported values fail safe (§5.3, §11.1) | `validation.ts` | `engine.test.ts` | Done |
| A11 | Currency bound to the request; mismatch fails safe (§5.3) | `engine.ts` | `engine.test.ts` | Done |

## Approval lifecycle

| # | Requirement (source) | Implementation | Tests | Status |
| --- | --- | --- | --- | --- |
| B1 | `ASK` stays pending until decided (§1, §8) | `src/core/purchases/lifecycle.ts` | `lifecycle.test.ts` | Done |
| B2 | Approval applies to one immutable request (§5.3, §8) | `purchases/fingerprint.ts`, `lifecycle.ts` | `lifecycle.test.ts` | Done |
| B3 | Material changes invalidate approval (§5.3, §11.1) | `fingerprint.ts` | `lifecycle.test.ts` | Done |
| B4 | Approval cannot override the monthly cap (§5.3, §11.1) | `lifecycle.ts` (`approvePurchase`) | `lifecycle.test.ts` | Done |
| B5 | Recheck hard constraints immediately before execution (§5.3, §11.1) | `lifecycle.ts` (`revalidateBeforeExecution`) | `lifecycle.test.ts` | Done |
| B6 | `DENY` makes payment execution unreachable (§5.3) | `lifecycle.ts` + `execution/execute.ts` (blocks any non-ready record) | `lifecycle.test.ts`, `execute.test.ts` | Done (execution core) |
| B7 | Human decision recorded separately from payment outcome (§5.3, §9) | `purchases/types.ts` (`approval`/`rejection`) + `execution/execute.ts` (SUBMITTED / CAPTURE_VERIFIED / CAPTURE_FAILED events) | `lifecycle.test.ts`, `execute.test.ts` | Done (execution core) |
| B8 | Approval expiry | Not implemented (decided: no expiry for MVP) | — | N/A (by decision) |

## Durable state & accounting

| # | Requirement (source) | Implementation | Tests | Status |
| --- | --- | --- | --- | --- |
| C1 | Durable spending records; no in-memory-only counter (§2.8, §5.4) | `src/infra/persistence/*` (Drizzle + PostgreSQL/Supabase) | `persistence.test.ts`; live `npm run db:check` | Done (live Supabase: all 5 tables migrated and reachable) |
| C2 | Track spending against the monthly cap (§2.8) | `spending/ledger.ts` (`capturedMinor`) + `services/spendingState.ts` reads it into the engine at approval and execution | `spending/ledger.test.ts`, `engine.test.ts`, `services/purchaseService.test.ts`; live `npm run purchase -- budget` | Done (live read/write wiring complete) |
| C3 | Count spending only after a verified capture (§4.10, §5.3) | `spending/ledger.ts` | `spending/ledger.test.ts` | Done |
| C4 | Duplicate requests/retries/captures don't double-count (§5.3, §11.2) | `spending/ledger.ts` + DB primary key (`persistence/schema.ts`) | `spending/ledger.test.ts`, `persistence.test.ts` | Done |
| C5 | Concurrency cannot overspend the cap (§5.3, §11.2) | `spending/ledger.ts` (`RESERVED`/`RELEASED` totals) | `spending/ledger.test.ts` | Partial (mechanism present; enforcement deferred to Phase 4 by decision) |
| C6 | State survives restart (§11.2) | `infra/persistence/schema.ts` (durable Postgres) | `persistence.test.ts` (close & reopen) | Done |
| C7 | Monthly period/reset semantics (§5.4) | `spending/period.ts` (`utcMonthPeriod`) | `spending/ledger.test.ts` | Done (UTC calendar month, per owner decision) |
| C8 | Audit fields recorded (§9) | `purchases/types.ts`, `spending/types.ts`, `infra/persistence/*` | `persistence.test.ts` | Done |
| C9 | Users can define spending rules; rules are persisted (§2.9, §5.1) | `core/authorization/rulesStore.ts`, `infra/persistence/ruleStore.ts` (`DrizzleSpendingRulesStore`) | `persistence.test.ts` | Done (single global rule set, per owner decision) |

**Live verification:** `npm run db:check` (`scripts/db-check.ts`) connects with
the application's `DATABASE_URL` and confirms the migrated schema.

- **Observed (Supabase):** `npm run db:migrate` applied all committed migrations,
  and `npm run db:check` reported all 5 tables present and reachable
  (`purchase_requests`, `evaluations`, `spending_events`, `spending_rules`,
  `saved_payment_methods`). Counts start at 0 until the application writes.

## PayPal integration

| # | Requirement (source) | Implementation | Tests | Status |
| --- | --- | --- | --- | --- |
| D1 | Sandbox OAuth + Orders API flow (§3.1, §3.2) | `infra/paypal/config.ts` (SDK client), `infra/paypal/gateway.ts` (create + capture), `infra/paypal/ports.ts` | `gateway.test.ts` (fake port); live run via `scripts/sandbox-verify.ts` | Done (live Sandbox PASS — card vault, capture `4GR46789K0392653X`) |
| D2 | No payment execution for denied requests (§11.3) | `core/execution/execute.ts` (re-check gate before any provider call; agent never gets `pay_order`) | `execute.test.ts` | Done (execution core; live adapter wired) |
| D3 | Capture verification & status persistence (§11.3) | `core/execution/execute.ts` (receipt amount/currency verified; capture recorded via ledger) + `infra/paypal/gateway.ts` extracts the provider receipt | `execute.test.ts`, `gateway.test.ts` | Done (live card capture verified & counted once) |
| D4 | Failure/timeout handling without duplicate payment (§10, §11.3) | `core/execution/execute.ts` (FAILED/PENDING record nothing; idempotent by provider capture id) + `gateway.ts` (idempotent `paypalRequestId`; duplicate capture recovered; provider errors fail safe) | `execute.test.ts`, `gateway.test.ts` | Partial (duplicate capture handled live; explicit retry/timeout policy still to be exercised against the live provider) |
| D5 | Secrets server-side; never in browser/logs/commits (§6.2, §15) | `infra/paypal/config.ts` refuses non-Sandbox; env read by app layer only; vault token stored server-side; `.gitignore` | `gateway.test.ts`, `vault.test.ts`; live run printed no secrets | Done |
| D6 | Integration path chosen (Orders API vs MCP vs Agent Toolkit) (§6.4) | Chosen: **Vercel AI SDK + an OpenAI-compatible provider** (`OPEN-DECISIONS.md`); PayPal execution stays in the underlying server SDK, behind the authorizer | `agent.test.ts` (agent has no payment tool) | Done (agent wired; execution via server SDK) |
| D7 | Allow the agent to pay without a human present (§7, §8) | `infra/paypal/vault.ts` (setup token → approval URL → payment token; card enrollment server-side) | `vault.test.ts`; live run via `scripts/sandbox-verify.ts` | Done (live vault enrollment + authorizer-gated capture) |
| D8 | Vaulted payment method stored durably, server-side only (§2.8, §9) | `core/payments/*`, `infra/persistence/paymentMethodStore.ts` (`DrizzlePaymentMethodStore`), `saved_payment_methods` table (UNIQUE provider token, `source_type`) | `persistence.test.ts` | Done |
| D9 | A pending (unsettled) capture is never counted, and can be reconciled (§4.10, §5.3) | `core/execution/execute.ts` (`PENDING` outcome, `PENDING_SETTLEMENT` status, `CAPTURE_PENDING` event, `reconcilePendingPurchase`); `spending/types.ts` + `validation.ts`; `infra/paypal/gateway.ts` (`checkCapture`) | `execute.test.ts`, `gateway.test.ts`, `spending` validation | Done (unit); live wallet path observed `PENDING_REVIEW` |
| D10 | Card and PayPal-wallet payment sources both supported (§3.2, §7) | `core/payments/types.ts` (`sourceType`), `infra/paypal/gateway.ts` (`buildCreateOrderBody`), `infra/paypal/vault.ts` (`enrollCardVault`), `saved_payment_methods.source_type` | `gateway.test.ts`, `persistence.test.ts` | Done (card live-verified; wallet live-verified as pending) |

**Live verification:** `scripts/sandbox-verify.ts` (`npm run sandbox:verify`)
exercises D1, D2, D3, D5, D7, D9, and D10 against PayPal Sandbox in a single run.
By default it enrolls a server-side Sandbox test **card** (no browser step); the
`--wallet` flag (`npm run sandbox:verify:wallet`) uses a PayPal wallet with
browser approval. It is a manual, credential-gated step (it needs real Sandbox
credentials), so it is not part of `npm test`.

- **Observed (first live attempt):** the setup-token call returned HTTP 403
  `NOT_AUTHORIZED` ("Authorization failed due to insufficient permissions.")
  because the Sandbox app did not have the **Vault** feature enabled. Fix:
  Developer Dashboard → the app → **Sandbox App Settings → App Feature Options**
  → check **Accept payments** → **Advanced options** → enable **Vault**. Vaulting
  is supported in a listed set of countries (US, Canada, much of Europe,
  Australia, parts of Asia). Provider errors now surface the status code and
  structured reason (`infra/paypal/errors.ts`).
- **Observed (second live attempt):** vault enrollment succeeded and the
  authorization engine returned **ALLOW** (`WITHIN_LIMITS`). Execution then
  reached PayPal but capture returned HTTP 422 `UNPROCESSABLE_ENTITY` — "Order
  already captured. If `intent=CAPTURE` only one capture per order is allowed."
  Cause: for a **vaulted, merchant-initiated** payment, PayPal captures during
  order **creation**, so our follow-up capture is a duplicate. Fix: the gateway
  now reads the capture from the create response, fetches the order
  (`getOrder`) when creation reports `COMPLETED` without a capture, and — if a
  capture call is still rejected — re-reads the order and adopts the existing
  capture instead of reporting a false failure. PayPal is treated as the source
  of truth, so spending is counted from the provider's verified capture. Re-run
  pending.
- **Observed (third live run + decision, PASS on the card path):** the re-run
  returned an order of `COMPLETED` with an **unsettled** capture (`PENDING`,
  `statusDetails.reason = PENDING_REVIEW`) for the **PayPal-wallet** vault. A
  contrast run with a **card** vault captured `COMPLETED` immediately, and the
  wallet capture stayed pending across repeated polls — so this is PayPal risk
  review for a wallet-vault, merchant-initiated charge in Sandbox, not a code
  defect. The owner approved **supporting both sources**, using a **card** for
  the live green demo, and treating `PENDING` as a real, non-counted state.
  **Result — `npm run sandbox:verify` (card):** decision `ALLOW`
  (`WITHIN_LIMITS`); execution `CAPTURED`; provider capture id
  `4GR46789K0392653X`; `100 USD`; record `EXECUTED`; ledger
  `capturedMinor = 100` (counted exactly once). The `--wallet` path reports
  `PENDING` and counts nothing, as designed.
- **Observed (fourth live run, first under Option 1, PASS on the card path):**
  auto-approve is now OFF product-wide (`autoApproveEnabled`, defaulted false
  on every rules read; no schema change). The $1.00 request that older rules
  auto-ALLOWed returned **ASK** (`APPROVAL_REQUIRED`, "Auto-approve is off;
  every purchase needs the owner's approval."), the script recorded the human
  approval step, and only then did execution proceed. **Result —
  `npm run sandbox:verify` (card):** `ASK` → `PENDING_APPROVAL` → approved →
  `APPROVED`; execution `CAPTURED`; provider capture id `6WL90084PC408574N`;
  `100 USD`; 2026-10-12; record `EXECUTED`; ledger `capturedMinor = 100`
  (counted exactly once).

## AI agent

| # | Requirement (source) | Implementation | Tests | Status |
| --- | --- | --- | --- | --- |
| E1 | Agent proposes structured purchases; never authorizes (§7) | `src/agent/*` — `ProposalService` files the request, `propose_purchase` tool, `agent.ts` instructions | `agent.test.ts` | Done |
| E2 | Agent cannot bypass authorization or call the provider directly (§7) | `src/agent/tools.ts` exposes **exactly one** tool (`propose_purchase`) and no payment tool; the tool calls the deterministic engine and returns its verdict unchanged | `agent.test.ts` (tool-set assertion; decision + persistence) | Done |
| E3 | AI model/provider/framework chosen (§7, §14) | Framework: **Vercel AI SDK** + `@ai-sdk/openai-compatible`; provider: **Experiential Labs** (OpenAI-compatible gateway). Model: **`deepseek-v4-flash`** via `AGENT_MODEL` | `agent.test.ts` (config) | Done (live model call verified) |

**How the AI is used, precisely:** the model only turns a natural-language
request into a structured `propose_purchase` call. It never sees a payment tool,
never decides, and never executes. The engine returns `ALLOW` / `ASK` / `DENY`,
and the model can only report that verdict. A live model call is a manual,
credential-gated step (`npm run agent`), so it is not part of `npm test`.

**Live AI-agent verification (observed).** With `AGENT_MODEL=deepseek-v4-flash`
and the durable database connected, the agent turned natural-language requests
into `propose_purchase` calls and the deterministic engine returned:

- `"buy a 49 dollar software license from Acme"` -> **ASK**
  (`APPROVAL_REQUIRED`, new payee), status `PENDING_APPROVAL`.
- `"buy a 5000 dollar software license from Beta Corp"` -> **DENY**
  (`MONTHLY_CAP_EXCEEDED`), status `DENIED` — the model could not override it.

A following `npm run db:check` showed the writes landed durably:
`purchase_requests` 2, `evaluations` 2, `spending_events` 2, `spending_rules` 1.
Twelve budget-class models were additionally checked for tool-calling
compatibility (see `OPEN-DECISIONS.md`).

After the owner set their real limits (`owner-1`: $50 automatic per purchase,
$100 hard monthly cap), the agent was re-checked: a **$150** request -> **DENY**
(`MONTHLY_CAP_EXCEEDED`); a **$75** request -> **ASK**
(`PER_PURCHASE_LIMIT_EXCEEDED`); and a **$40 travel** booking -> **ASK**
(`APPROVAL_REQUIRED`), confirming the newly permitted category is accepted.

## End-to-end flow (propose → approve → pay → count)

| # | Requirement (source) | Implementation | Tests | Status |
| --- | --- | --- | --- | --- |
| G1 | One runnable flow ties propose, approve, pay, and count together | `src/services/purchaseService.ts`, `scripts/purchase.ts` (`npm run purchase`) | `purchaseService.test.ts`; live run | Done (live Sandbox PASS) |
| G2 | Approval is per-request and re-checks current rules; the cap cannot be approved through | `services/purchaseService.ts` (`approve`) + `purchases/lifecycle.ts` | `purchaseService.test.ts` (cap refusal), `lifecycle.test.ts` | Done |
| G3 | Execution re-runs the deterministic gate immediately before payment | `services/purchaseService.ts` (`pay`) + `execution/execute.ts` | `purchaseService.test.ts`, `execute.test.ts` | Done |
| G4 | A verified capture is counted exactly once; a repeated pay is blocked | `spending/ledger.ts` + `services/purchaseService.ts` | `purchaseService.test.ts`; live double-pay observed `BLOCKED` | Done |
| G5 | A pending capture is not counted and can be reconciled | `execution/execute.ts` (`reconcilePendingPurchase`) + `services/purchaseService.ts` (`reconcile`) | `purchaseService.test.ts`, `execute.test.ts` | Done |
| G6 | One source of truth for the engine's facts (spend + known payees) | `src/services/spendingState.ts`, used by both the agent and the approval/execution paths | `purchaseService.test.ts`, `agent.test.ts` | Done |
| G7 | The human decision is recorded separately from the payment outcome | `purchases/types.ts` + lifecycle/ledger events (`PROPOSED`, `APPROVED`, `REJECTED`, `SUBMITTED`, `CAPTURE_VERIFIED`) | `purchaseService.test.ts`, `lifecycle.test.ts`, `execute.test.ts` | Done |

**Live verification (observed, durable database).** The agent proposed
`$1.00` to a first-time payee -> engine **ASK** (`APPROVAL_REQUIRED`,
`PENDING_APPROVAL`); the owner `approve`d it; `pay` executed through the vaulted
Sandbox **card** and returned **CAPTURED** (capture `00053762B0399214K`,
`1.00 USD`); the durable ledger counted it **once**; a second `pay` returned
**BLOCKED** (`status: EXECUTED`) and did **not** double-count; and a fresh process
reported `spent this month 1.00 USD / remaining 99.00 USD`. Commands:
`npm run purchase -- {enroll, pending, show <id>, approve <id>, pay <id>, budget}`.

## UI

| # | Requirement (source) | Implementation | Tests | Status |
| --- | --- | --- | --- | --- |
| F1 | UI designed and approved by owner (§11, §12 P6) | `design-research/` — Live Instrument specimens, v3 locked (anchor wall, type A, curated-pool live feed, away notice); `CONSTRAINTS.md` §7 | Browser-verified specimens; owner approved the v3 feel | Design direction done; honesty sweep done; the v3 Live Instrument look is now folded into the real Gate (Phase 3); Record, case file and Statute stay on Print |
| F2 | Interface implemented after approval (§16) | Option 1 (every request needs you) landed in the engine and, after the Phase 1b sweep, on every screen; the live catalog feed (arrivals, entry animation, away badge and tab count) landed in Phase 2; the Phase 3 Gate rebuild landed the anchor wall (hero spent figure, filling wall that shifts colour near the cap, fixed limit line), decision cards with a pulse on the one waiting item, and inline Approve/Decline that shows an "Authorizing" beat then the real outcome plus the short PayPal capture reference the instant it settles; browser-verified live | `engine.test.ts`, service and lifecycle coverage, ask-outcome copy pins, `catalog.test.ts` feed pins, `gateCard.test.ts` card-vocabulary pins | In progress (Gate done; Record, case file and Statute remain on Print) |
| F3 | Sponsor tooling (e.g. AG Grid) for decision/audit tables | Owner chose core-app-first; AG Studio "Insights" is a late-October stretch (the sponsor prize stacks) | — | Deferred (stretch candidate) |

------------------------------------------------------------------------

## Test suite

- Location: `src/**/*.test.ts`
- Runner: Vitest (`npm test`)
- Current: **262 tests passing** — the areas listed in earlier revisions
  (authorization, lifecycle, spending, execution, persistence against a real
  in-process PostgreSQL engine, PayPal money/gateway/vault, AI agent,
  application service) plus the rules editor, the sign-in/sign-up actions, the
  card-vault request-id limit, and per-user data separation. The newest pins
  cover Option 1 (auto-approve off, every request inside the cap needs the
  owner, a legacy `AUTHORIZED` record can never ride older rules to payment, and
  the ask box points at the one number the owner sets), the live catalog feed
  (the fourteen-item pool and its categories, the deterministic per-person deck,
  surfacing VERBATIM through the real engine, the twenty-second arrival gap that
  makes reloads idempotent, the derived catalog history, and the hold-back rule
  that pauses the feed once four requests are waiting on the owner), and the
  Phase 3 Gate card vocabulary (a waiting request reads "needs you" with no
  stamp, only a verified capture stamps Paid, an approval that has not captured
  yet stays out of the Paid stamp, a refused request reads Blocked in plain words
  with no money moved and no raw reason code, the owner's own refusal reads
  distinctly from a rule refusal, and the honest source label never calls a typed
  ask the assistant's).

Update this file whenever a requirement's status changes.
