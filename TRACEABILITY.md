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
| B6 | `DENY` makes payment execution unreachable (§5.3) | `lifecycle.ts`, status gating | `lifecycle.test.ts` | Partial (enforced at domain level; payment layer pending) |
| B7 | Human decision recorded separately from payment outcome (§5.3, §9) | `purchases/types.ts` (`approval`/`rejection`) | `lifecycle.test.ts` | Partial (payment side pending) |
| B8 | Approval expiry | Not implemented (decided: no expiry for MVP) | — | N/A (by decision) |

## Durable state & accounting

| # | Requirement (source) | Implementation | Tests | Status |
| --- | --- | --- | --- | --- |
| C1 | Durable spending records; no in-memory-only counter (§2.8, §5.4) | `spending/store.ts`, `spending/ledger.ts` (event log; interface + in-memory) | `spending/ledger.test.ts` | Partial (durable DB not chosen) |
| C2 | Track spending against the monthly cap (§2.8) | `spending/ledger.ts` (`capturedMinor`) + engine reads `spentThisMonthMinor` | `spending/ledger.test.ts`, `engine.test.ts` | Partial (engine wiring pending) |
| C3 | Count spending only after a verified capture (§4.10, §5.3) | `spending/ledger.ts` | `spending/ledger.test.ts` | Done |
| C4 | Duplicate requests/retries/captures don't double-count (§5.3, §11.2) | `spending/ledger.ts`, `spending/validation.ts` (`captureEventId`) | `spending/ledger.test.ts` | Done |
| C5 | Concurrency cannot overspend the cap (§5.3, §11.2) | `spending/ledger.ts` (`RESERVED`/`RELEASED` totals) | `spending/ledger.test.ts` | Partial (mechanism present; enforcement deferred to Phase 4 by decision) |
| C6 | State survives restart (§11.2) | Totals derived from persisted events; in-memory store is not durable | `spending/ledger.test.ts` (reload) | Pending (DB not chosen) |
| C7 | Monthly period/reset semantics (§5.4) | `spending/period.ts` (`utcMonthPeriod`) | `spending/ledger.test.ts` | Done (UTC calendar month, per owner decision) |
| C8 | Audit fields recorded (§9) | `purchases/types.ts`, `spending/types.ts` | `lifecycle.test.ts`, `spending/ledger.test.ts` | Partial (needs durable store) |

## PayPal integration

| # | Requirement (source) | Implementation | Tests | Status |
| --- | --- | --- | --- | --- |
| D1 | Sandbox OAuth + Orders API flow (§3.1, §3.2) | Manually proven (pre-existing) | — | Partial (not app-integrated) |
| D2 | No payment execution for denied requests (§11.3) | Not implemented | — | Pending |
| D3 | Capture verification & status persistence (§11.3) | Not implemented | — | Pending |
| D4 | Failure/timeout handling without duplicate payment (§10, §11.3) | Not implemented | — | Pending |
| D5 | Secrets server-side; never in browser/logs/commits (§6.2, §15) | Policy (`ENGINEERING.md`, `.gitignore`) | — | Partial |
| D6 | Integration path chosen (Orders API vs MCP vs Agent Toolkit) (§6.4) | Not chosen | — | Pending (open decision) |

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
- Current: **61 tests passing** — 23 authorization, 19 lifecycle, 19 spending.

Update this file whenever a requirement's status changes.
