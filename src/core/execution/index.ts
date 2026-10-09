/**
 * Public surface of the execution core.
 *
 * The core owns the authorization-gated execution *logic* and the
 * `PaymentGateway` port; concrete provider adapters live in `src/infra`.
 */

export type {
  PaymentGateway,
  PaymentInstruction,
  PaymentOutcome,
} from "./types";
export {
  executeAuthorizedPurchase,
  reconcilePendingPurchase,
  type ExecuteAuthorizedPurchaseArgs,
  type ExecutionCapture,
  type ExecutionOutcome,
  type ExecutionStatus,
  type PendingCapture,
  type ReconcilePendingPurchaseArgs,
} from "./execute";
