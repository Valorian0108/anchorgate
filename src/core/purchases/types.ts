/**
 * Purchase request lifecycle vocabulary (Phase 3).
 *
 * A `PurchaseRecord` is the durable representation of a proposed purchase and
 * everything that happened to it: the engine's decision(s), the human approval
 * or rejection, and the request's current status.
 *
 * The embedded `PurchaseRequest` is treated as IMMUTABLE. A request's identity
 * is bound to its `fingerprint`, which covers its material details. Changing any
 * material detail produces a different fingerprint — i.e. a different request
 * that must be approved from scratch.
 */

import type { DecisionResult, PurchaseRequest } from "../authorization";

/**
 * Lifecycle status of a purchase request.
 *
 * - `DENIED`            engine refused it (hard constraint), or it was refused
 *                       at re-check. Final.
 * - `AUTHORIZED`        engine allowed it; may proceed to execution.
 * - `PENDING_APPROVAL`  engine asked for human approval; awaiting a decision.
 * - `APPROVED`          a human approved it; may proceed to execution.
 * - `REJECTED`          a human rejected it. Final.
 * - `EXECUTED`          payment was captured and verified with the provider.
 *                       Final.
 */
export type RequestStatus =
  | "DENIED"
  | "AUTHORIZED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTED";

/** When and by whom a request was approved. */
export interface ApprovalRecord {
  approvedBy: string;
  approvedAt: string;
}

/** When and by whom a request was rejected. */
export interface RejectionRecord {
  rejectedBy: string;
  rejectedAt: string;
  reason?: string;
}

/**
 * A single recorded authorization evaluation.
 *
 * The same request is evaluated more than once over its life (at proposal, at
 * approval, and immediately before execution). Keeping each evaluation lets the
 * audit trail show *why* the outcome changed, rather than only the last answer.
 */
export type EvaluationContext = "PROPOSAL" | "APPROVAL" | "PRE_EXECUTION";

export interface Evaluation {
  context: EvaluationContext;
  decision: DecisionResult;
  evaluatedAt: string;
}

/** The durable record for a purchase request. */
export interface PurchaseRecord {
  id: string;
  /** The proposed purchase. Immutable once recorded. */
  request: PurchaseRequest;
  /** SHA-256 over the request's material details; binds approvals. */
  fingerprint: string;
  status: RequestStatus;
  createdAt: string;
  /** Every authorization evaluation, oldest first. */
  evaluations: Evaluation[];
  approval?: ApprovalRecord;
  rejection?: RejectionRecord;
}

/** The outcome of a state transition, carrying the (possibly updated) record. */
export interface TransitionOutcome {
  ok: boolean;
  record: PurchaseRecord;
  /** The decision produced by the evaluation that drove this transition. */
  decision: DecisionResult;
  /** Human-readable explanation of what happened. */
  reason: string;
}
