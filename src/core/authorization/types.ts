/**
 * Core authorization vocabulary.
 *
 * These types describe the *trusted, evaluated* shapes. Untrusted input — from
 * the AI agent, the browser, or storage — is validated at the engine boundary
 * before it is ever treated as one of these types. Validation lives in
 * `validation.ts` and is applied by `engine.ts`.
 *
 * Money is represented as an INTEGER in the currency's minor units (e.g. cents
 * for USD) to avoid floating-point money errors. Currency is an ISO 4217 code.
 * The MVP does not perform currency exchange, so a request whose currency does
 * not match the configured rules is rejected.
 */

export type AuthorizationDecision = "ALLOW" | "ASK" | "DENY";

/**
 * Stable, machine-readable reason codes.
 *
 * Every decision carries exactly one. These are recorded in the audit trail and
 * must not be reworded without a version bump, because other parts of the
 * system (and the audit records) depend on them.
 */
export enum ReasonCode {
  /** The proposed purchase was missing, malformed, or ambiguous. */
  INVALID_REQUEST = "INVALID_REQUEST",
  /** The spending rules were missing or malformed. Fails safe. */
  INVALID_RULES = "INVALID_RULES",
  /** The spending state could not be read reliably. Fails safe. */
  INVALID_STATE = "INVALID_STATE",
  /** Amount was zero or negative. */
  INVALID_AMOUNT = "INVALID_AMOUNT",
  /** Request currency does not match the configured rules currency. */
  CURRENCY_MISMATCH = "CURRENCY_MISMATCH",
  /** The category is not on the permitted list. */
  CATEGORY_NOT_PERMITTED = "CATEGORY_NOT_PERMITTED",
  /** The purchase would exceed the (hard) monthly cap. */
  MONTHLY_CAP_EXCEEDED = "MONTHLY_CAP_EXCEEDED",
  /** The purchase is above the automatic per-purchase limit. */
  PER_PURCHASE_LIMIT_EXCEEDED = "PER_PURCHASE_LIMIT_EXCEEDED",
  /** Another configured approval condition applies. */
  APPROVAL_REQUIRED = "APPROVAL_REQUIRED",
  /** The purchase satisfies all automatic checks. */
  WITHIN_LIMITS = "WITHIN_LIMITS",
}

/**
 * A proposed purchase. The agent supplies this; it is never trusted as-is.
 */
export interface PurchaseRequest {
  /** Stable identifier for this specific request. */
  id: string;
  /** Identifier of the agent that proposed the purchase. */
  agentId: string;
  /** Merchant / payee the money would go to. */
  payee: string;
  /** Human-readable purpose of the purchase. */
  purpose: string;
  /** Category key, matched against the permitted categories. */
  category: string;
  /** Integer amount in the currency's minor units (e.g. cents). */
  amountMinor: number;
  /** ISO 4217 currency code (e.g. "USD"). */
  currency: string;
}

/**
 * The user-configured rules that limit what the agent may spend.
 */
export interface SpendingRules {
  /** Version tag of this rule set; recorded with every decision. */
  ruleVersion: string;
  /** Currency these rules are denominated in. */
  currency: string;
  /** At or below this amount, no approval is needed (if all else passes). */
  perPurchaseAutoLimitMinor: number;
  /** Hard monthly ceiling. Approval may never override this. */
  monthlyCapMinor: number;
  /** Only these categories may be paid. An empty list permits nothing. */
  permittedCategories: string[];
  /** When true, an unseen payee always requires human approval. */
  requireApprovalForNewPayee: boolean;
}

/**
 * Durable spending state, read fresh for each evaluation.
 *
 * Keeping this separate from the rules means rules (policy) and state (fact)
 * stay independent, and the engine remains a pure function of its inputs.
 */
export interface SpendingState {
  /** Amount already *completed* (verified) this monthly period. */
  spentThisMonthMinor: number;
  /** Payees the user has previously approved or paid. */
  knownPayees: string[];
}

/**
 * The engine's verdict for a single purchase request.
 */
export interface DecisionResult {
  decision: AuthorizationDecision;
  reasonCode: ReasonCode;
  /** Human-readable explanation, suitable for showing and for the audit log. */
  reason: string;
  /** The rule version the decision was made against. */
  ruleVersion: string;
}
