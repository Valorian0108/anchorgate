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
| C1 | Durable spending records; no in-memory-only counter (§2.8, §5.4) | `src/infra/persistence/*` (Drizzle + PostgreSQL/Supabase) | `persistence.test.ts` | Done |
| C2 | Track spending against the monthly cap (§2.8) | `spending/ledger.ts` (`capturedMinor`) + engine reads `spentThisMonthMinor` | `spending/ledger.test.ts`, `engine.test.ts` | Partial (live read/write wiring into the running app pending) |
| C3 | Count spending only after a verified capture (§4.10, §5.3) | `spending/ledger.ts` | `spending/ledger.test.ts` | Done |
| C4 | Duplicate requests/retries/captures don't double-count (§5.3, §11.2) | `spending/ledger.ts` + DB primary key (`persistence/schema.ts`) | `spending/ledger.test.ts`, `persistence.test.ts` | Done |
| C5 | Concurrency cannot overspend the cap (§5.3, §11.2) | `spending/ledger.ts` (`RESERVED`/`RELEASED` totals) | `spending/ledger.test.ts` | Partial (mechanism present; enforcement deferred to Phase 4 by decision) |
| C6 | State survives restart (§11.2) | `infra/persistence/schema.ts` (durable Postgres) | `persistence.test.ts` (close & reopen) | Done |
| C7 | Monthly period/reset semantics (§5.4) | `spending/period.ts` (`utcMonthPeriod`) | `spending/ledger.test.ts` | Done (UTC calendar month, per owner decision) |
| C8 | Audit fields recorded (§9) | `purchases/types.ts`, `spending/types.ts`, `infra/persistence/*` | `persistence.test.ts` | Done |
| C9 | Users can define spending rules; rules are persisted (§2.9, §5.1) | `core/authorization/rulesStore.ts`, `infra/persistence/ruleStore.ts` (`DrizzleSpendingRulesStore`) | `persistence.test.ts` | Done (single global rule set, per owner decision) |

## PayPal integration

| # | Requirement (source) | Implementation | Tests | Status |
| --- | --- | --- | --- | --- |
| D1 | Sandbox OAuth + Orders API flow (§3.1, §3.2) | `infra/paypal/config.ts` (SDK client), `infra/paypal/gateway.ts` (create + capture), `infra/paypal/ports.ts` | `gateway.test.ts` (fake port); live run via `scripts/sandbox-verify.ts` | Partial (adapter implemented; `npm run sandbox:verify` ready; real Sandbox run pending credentials) |
| D2 | No payment execution for denied requests (§11.3) | `core/execution/execute.ts` (re-check gate before any provider call; agent never gets `pay_order`) | `execute.test.ts` | Done (execution core; live adapter pending) |
| D3 | Capture verification & status persistence (§11.3) | `core/execution/execute.ts` (receipt amount/currency verified; capture recorded via ledger) + `infra/paypal/gateway.ts` extracts the provider receipt | `execute.test.ts`, `gateway.test.ts` | Done (execution core; live adapter pending) |
| D4 | Failure/timeout handling without duplicate payment (§10, §11.3) | `core/execution/execute.ts` (FAILED records nothing; idempotent by provider capture id) + `gateway.ts` (idempotent `paypalRequestId`; provider errors fail safe) | `execute.test.ts`, `gateway.test.ts` | Partial (retry/timeout semantics against live provider pending) |
| D5 | Secrets server-side; never in browser/logs/commits (§6.2, §15) | `infra/paypal/config.ts` refuses non-Sandbox; env read by app layer only; vault token stored server-side; `.gitignore` | `gateway.test.ts`, `vault.test.ts` | Partial (live check pending) |
| D6 | Integration path chosen (Orders API vs MCP vs Agent Toolkit) (§6.4) | Chosen: **Agent Toolkit (TypeScript) + Vercel AI SDK** (`OPEN-DECISIONS.md`); execution via the underlying server SDK | — | Done (decision; agent wiring pending) |
| D7 | Allow the agent to pay without a human present (§7, §8) | `infra/paypal/vault.ts` (setup token → approval URL → payment token) | `vault.test.ts`; live run via `scripts/sandbox-verify.ts` | Partial (implemented & unit-tested; `npm run sandbox:verify` ready; real Sandbox run pending credentials) |
| D8 | Vaulted payment method stored durably, server-side only (§2.8, §9) | `core/payments/*`, `infra/persistence/paymentMethodStore.ts` (`DrizzlePaymentMethodStore`), `saved_payment_methods` table (UNIQUE provider token) | `persistence.test.ts` | Done |

**Live verification:** `scripts/sandbox-verify.ts` (`npm run sandbox:verify`)
exercises D1, D2, D3, D5, and D7 against PayPal Sandbox in a single run. It is a
manual, credential-gated step (it requires a browser approval and real Sandbox
credentials), so it is not part of `npm test`. Its observed result will be
recorded here once the owner runs it.

## AI agent

| # | Requirement (source) | Implementation | Tests | Status |
| --- | --- | --- | --- | --- |
| E1 | Agent proposes structured purchases; never authorizes (§7) | Not implemented | — | Pending |
| E2 | Agent cannot bypass authorization or call the provider directly (§7) | Architectural intent only | — | Pending |
| E3 | AI model/provider/framework chosen (§7, §14) | Not chosen | — | Pending (open decision) |

## UI

| # | Requirement (source) | Implementation | Tests | Status |
| --- | --- | --- | --- | --- |
| F1 | UI designed and approved by owner (§11, §12 P6) | Not started | — | Pending (gated on design discussion) |
| F2 | Interface implemented after approval (§16) | Not started | — | Pending |
| F3 | Sponsor tooling (e.g. AG Grid) for decision/audit tables | Not implemented | — | Pending (Phase 6 candidate) |

------------------------------------------------------------------------

## Test suite

- Location: `src/**/*.test.ts`
- Runner: Vitest (`npm test`)
- Current: **109 tests passing** — 23 authorization, 19 lifecycle, 19 spending,
  8 execution, 14 persistence (against a real in-process PostgreSQL engine,
  including a close-and-reopen durability test), 11 PayPal money conversion,
  9 PayPal gateway (fake port), 6 PayPal vault enrollment (fake port).

Update this file whenever a requirement's status changes.
