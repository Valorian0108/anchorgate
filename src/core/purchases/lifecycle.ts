/**
 * Purchase request lifecycle (Phase 3).
 *
 * The engine (in `../authorization`) decides ALLOW / ASK / DENY. This module
 * turns that decision into a durable, tracked request and manages the human
 * approval step around it:
 *
 *   propose  -> AUTHORIZED | PENDING_APPROVAL | DENIED
 *   approve  -> APPROVED (after a re-check against CURRENT rules)
 *   reject   -> REJECTED
 *
 * Everything here is a pure function of its inputs (plus a `now` for
 * timestamps). Nothing reads a clock, a database, or the network on its own.
 *
 * Owner decisions reflected here:
 *   - A pending request is immutable: any material change is a NEW request
 *     (a different fingerprint), which must be approved again.
 *   - Pending approvals do not expire (for the MVP).
 *   - Approval/execution re-checks against the CURRENT rules and budget. A hard
 *     constraint (e.g. the monthly cap) can never be overridden by approval.
 */

import {
  evaluatePurchase,
  parseRequest,
  type DecisionResult,
} from "../authorization";
import { computeFingerprint } from "./fingerprint";
import type {
  Evaluation,
  PurchaseRecord,
  RequestStatus,
  TransitionOutcome,
} from "./types";

function statusForDecision(decision: DecisionResult): RequestStatus {
  switch (decision.decision) {
    case "ALLOW":
      return "AUTHORIZED";
    case "ASK":
      return "PENDING_APPROVAL";
    case "DENY":
      return "DENIED";
  }
}

function evaluation(
  context: Evaluation["context"],
  decision: DecisionResult,
  now: Date,
): Evaluation {
  return { context, decision, evaluatedAt: now.toISOString() };
}

/** The result of proposing a purchase. `record` is null if the request was malformed. */
export interface ProposeOutcome {
  ok: boolean;
  decision: DecisionResult;
  record: PurchaseRecord | null;
}

/**
 * Propose a purchase: evaluate it and (if it is well-formed) produce a record.
 *
 * A malformed request is evaluated too — it returns DENY — but no record is
 * created, because there is no valid immutable request to bind.
 */
export function proposePurchase(
  requestInput: unknown,
  rules: unknown,
  state: unknown,
  now: Date,
): ProposeOutcome {
  const decision = evaluatePurchase(requestInput, rules, state);

  const parsed = parseRequest(requestInput);
  if (!parsed.ok) {
    return { ok: false, decision, record: null };
  }

  const request = parsed.value;
  const record: PurchaseRecord = {
    id: request.id,
    request,
    fingerprint: computeFingerprint(request),
    status: statusForDecision(decision),
    createdAt: now.toISOString(),
    evaluations: [evaluation("PROPOSAL", decision, now)],
  };

  return { ok: true, decision, record };
}

/**
 * Approve a pending request.
 *
 * Before approving, the request is re-evaluated against the CURRENT rules and
 * state. If a hard constraint is no longer satisfied (e.g. the monthly cap
 * would now be exceeded), approval is refused and the request becomes DENIED.
 * This is the mechanism that guarantees approval can never override the cap.
 */
export function approvePurchase(
  record: PurchaseRecord,
  approver: string,
  rules: unknown,
  state: unknown,
  now: Date,
): TransitionOutcome {
  if (record.status !== "PENDING_APPROVAL") {
    return {
      ok: false,
      record,
      decision: record.evaluations.at(-1)!.decision,
      reason: `Request is not awaiting approval (status: ${record.status}).`,
    };
  }

  const recheck = evaluatePurchase(record.request, rules, state);
  const withEvaluation: PurchaseRecord = {
    ...record,
    evaluations: [...record.evaluations, evaluation("APPROVAL", recheck, now)],
  };

  if (recheck.decision === "DENY") {
    return {
      ok: false,
      record: { ...withEvaluation, status: "DENIED" },
      decision: recheck,
      reason: `Cannot approve: a hard constraint is no longer satisfied. ${recheck.reason}`,
    };
  }

  return {
    ok: true,
    record: {
      ...withEvaluation,
      status: "APPROVED",
      approval: { approvedBy: approver, approvedAt: now.toISOString() },
    },
    decision: recheck,
    reason: "Approved.",
  };
}

/**
 * Reject a pending request. Rejection is final.
 */
export function rejectPurchase(
  record: PurchaseRecord,
  rejecter: string,
  now: Date,
  reason?: string,
): TransitionOutcome {
  if (record.status !== "PENDING_APPROVAL") {
    return {
      ok: false,
      record,
      decision: record.evaluations.at(-1)!.decision,
      reason: `Request is not awaiting approval (status: ${record.status}).`,
    };
  }

  const rejected: PurchaseRecord = {
    ...record,
    status: "REJECTED",
    rejection: { rejectedBy: rejecter, rejectedAt: now.toISOString(), ...(reason ? { reason } : {}) },
  };

  return {
    ok: true,
    record: rejected,
    decision: record.evaluations.at(-1)!.decision,
    reason: reason ? `Rejected: ${reason}` : "Rejected.",
  };
}

/**
 * Final gate immediately before payment execution.
 *
 * Re-evaluates the frozen request against the current rules and state:
 *   - A hard failure (DENY) blocks execution and marks the record DENIED.
 *   - An `AUTHORIZED` request that now needs approval is downgraded to
 *     `PENDING_APPROVAL` instead of executing.
 *   - An `APPROVED` request may proceed as long as no hard constraint fails
 *     (its approval already satisfies the soft conditions).
 */
export function revalidateBeforeExecution(
  record: PurchaseRecord,
  rules: unknown,
  state: unknown,
  now: Date,
): TransitionOutcome {
  if (record.status !== "AUTHORIZED" && record.status !== "APPROVED") {
    return {
      ok: false,
      record,
      decision: record.evaluations.at(-1)!.decision,
      reason: `Request is not ready for execution (status: ${record.status}).`,
    };
  }

  const recheck = evaluatePurchase(record.request, rules, state);
  const withEvaluation: PurchaseRecord = {
    ...record,
    evaluations: [...record.evaluations, evaluation("PRE_EXECUTION", recheck, now)],
  };

  if (recheck.decision === "DENY") {
    return {
      ok: false,
      record: { ...withEvaluation, status: "DENIED" },
      decision: recheck,
      reason: `Blocked before execution: ${recheck.reason}`,
    };
  }

  if (record.status === "AUTHORIZED" && recheck.decision !== "ALLOW") {
    return {
      ok: false,
      record: { ...withEvaluation, status: "PENDING_APPROVAL" },
      decision: recheck,
      reason: `Current rules now require approval before execution. ${recheck.reason}`,
    };
  }

  return {
    ok: true,
    record: withEvaluation,
    decision: recheck,
    reason: "Cleared for execution.",
  };
}
