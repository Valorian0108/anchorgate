/**
 * Public surface of the authorization core.
 *
 * Keep imports pointed at this module from the rest of the app. Authorization
 * must stay independent of the AI, the UI, PayPal transport, and storage.
 */

export type {
  AuthorizationDecision,
  DecisionResult,
  PurchaseRequest,
  SpendingRules,
  SpendingState,
} from "./types";
export { ReasonCode } from "./types";
export type { SpendingRulesStore } from "./rulesStore";
export { evaluatePurchase } from "./engine";
export {
  parseRequest,
  parseRules,
  parseState,
  readRuleVersion,
  isRecord,
  isNonEmptyString,
} from "./validation";
