/**
 * Application services (Phase 4/5): the layer that composes the pure core with
 * durable stores and the payment provider into a runnable flow.
 *
 * Nothing here makes an authorization decision; the core does.
 */

export { PurchaseService } from "./purchaseService";
export type {
  BudgetSnapshot,
  PayResult,
  PurchaseServiceDeps,
} from "./purchaseService";
export { readSpendingState } from "./spendingState";
export type { SpendingState, SpendingStateStores } from "./spendingState";
