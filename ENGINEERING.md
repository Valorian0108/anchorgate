# Engineering Standards & Accountability

**Standard of engagement:** This project is treated as a production system.
Every claim must be backed by evidence (a test result, an observed run, or a
recorded decision). "It should work" is not acceptable. "It was built" is not
the same as "it works."

This file is the rulebook for how the work is done. It is binding unless the
project owner changes it.

------------------------------------------------------------------------

## 1. Principles

1. **Deterministic core, isolated.** Authorization is pure logic with no
   dependency on the AI, the network, the UI, or storage. It is testable in
   isolation and must remain so.
2. **Fail safe.** Invalid, missing, malformed, or ambiguous input never becomes
   permission. If state cannot be read reliably, do not proceed.
3. **Evidence over assertion.** No requirement is "met" without a test or an
   observed result. Report what was actually run.
4. **Proposals are not approvals.** A recommendation, a draft, or generated code
   is never treated as a decision until the owner approves it.
5. **Least privilege & secret safety.** Credentials stay server-side. Never
   commit, log, print, or send secrets to the browser.
6. **Small, reversible, documented changes.** Prefer clear, testable increments.
   Document assumptions that were made to keep moving.
7. **No scope creep.** Material changes to authorization, payments, UI,
   framework, storage, auth, deployment, or scope require owner approval.

## 2. Non-negotiables (from the specification)

- The AI may propose; it may never decide or expand its own authority.
- Authorization occurs before payment execution and is enforced server-side.
- The monthly cap is a hard limit; approval may never override it.
- Approval is bound to one immutable request; material changes void it.
- Spending is counted only after a *verified* payment — never on proposal,
  authorization, approval, or submission.
- Payment status and authorization status are recorded separately.
- Duplicate requests/retries/captures must not create duplicate spending.
- PayPal is Sandbox-only for this project. No live funds.
- Do not claim production readiness, AP2 compliance, or end-to-end automation
  without evidence.

## 3. How change is managed

- **Decision register.** Every material decision, assumption, and open question
  is recorded in `OPEN-DECISIONS.md`. Unsettled items stay visibly open.
- **Commits.** Conventional-commit style (`feat:`, `fix:`, `docs:`, `chore:`,
  `test:`, `refactor:`). One logical change per commit. Docs updated alongside
  code, in the same or an immediately following commit.
- **Traceability.** Each requirement is mapped to its implementation and tests
  in `TRACEABILITY.md`.
- **Changelog.** User-visible changes are recorded in `CHANGELOG.md`.

## 4. Testing & evidence

- Every behavior has a test. The deterministic core is fully unit-tested.
- Untrusted input is validated at the boundary and covered by tests.
- PayPal integration uses **both** mocked responses (for deterministic unit
  tests) **and** real Sandbox integration tests. Mocks alone do not prove the
  integration works.
- Every phase ends by running `npm test` and `npm run typecheck`, and by
  reporting the exact commands and results.
- Outcomes are reported honestly: what passed, what failed, what was tested
  against Sandbox vs. only mocked, and what remains unverified.

## 5. Coding standards

- **TypeScript strict mode.** `tsc --noEmit` must pass with zero errors.
- **Untrusted input is `unknown`** until validated. No `any` without a written
  justification.
- **Domain core is isolated** under `src/core/**` and free of I/O concerns.
- **Money is integer minor units.** No floating-point money. No currency
  exchange in the MVP.
- **Boundaries validate.** Storage, HTTP handlers, and the agent interface all
  validate before handing data to the core.
- **Comments explain *why*, not *what*.** Non-obvious decisions are documented.

## 6. Phase gates

Each phase ends only when:

1. The code is implemented and typechecks.
2. Tests cover the phase's behavior and pass.
3. The decision register and traceability matrix are updated.
4. The result is reported with evidence, honestly, including limitations.

## 7. Definition of done (MVP / demo)

The MVP is demo-ready only when the spec's "Definition of done" is fully met:
approved UI implemented, rules configurable, agent proposes structured
purchases, the authorization engine enforces ALLOW/ASK/DENY, approval is
transaction-specific and cannot bypass hard constraints, PayPal Sandbox executes
only after authorization + buyer approval, payment outcomes are verified and
recorded separately, spending accounting is durable and non-duplicating, and
automated + end-to-end tests have been run and reported.

## 8. Security checklist (review before any payment-enabling change)

- [ ] Secrets/tokens never in browser code, logs, commits, or responses.
- [ ] Authorization enforced server-side, not only in the UI.
- [ ] Hard constraints re-checked immediately before execution.
- [ ] Idempotency applied to payment execution; duplicate capture prevented.
- [ ] Audit records free of credentials and unnecessary sensitive data.
- [ ] AI, browser, and external data validated before use.
- [ ] Sandbox-only; no live credentials.

------------------------------------------------------------------------

## Status snapshot

| Area | Status |
| --- | --- |
| Authorization engine | ✅ Implemented & tested |
| Purchase lifecycle (approval) | ✅ Implemented & tested |
| Spending accounting (verified captures only) | 🟡 Logic implemented & tested; not yet durable/wired |
| Durable storage | ⛔ Not built (in-memory only) |
| PayPal integration | ⛔ Not built |
| AI agent | ⛔ Not built |
| UI | ⛔ Not built (design not approved) |
| Automated tests | ✅ 61 passing |
| Typecheck | ✅ Clean |
