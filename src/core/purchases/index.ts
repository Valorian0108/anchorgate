/**
 * Public surface of the purchase lifecycle core.
 */

export type {
  ApprovalRecord,
  Evaluation,
  EvaluationContext,
  PurchaseRecord,
  RejectionRecord,
  RequestStatus,
  TransitionOutcome,
} from "./types";
export type { ProposeOutcome } from "./lifecycle";
export {
  approvePurchase,
  proposePurchase,
  rejectPurchase,
  revalidateBeforeExecution,
} from "./lifecycle";
export { computeFingerprint, matchesFingerprint } from "./fingerprint";
export { InMemoryPurchaseStore } from "./store";
export type { PurchaseStore } from "./store";
