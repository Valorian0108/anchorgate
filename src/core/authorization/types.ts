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
  /**
   * The purchase is above the automatic per-purchase limit.
   * Historical: only records judged before trust mode (16 oct 2026) carry this
   * code. The per-purchase auto line is retired; the trust list replaced it.
   */
  PER_PURCHASE_LIMIT_EXCEEDED = "PER_PURCHASE_LIMIT_EXCEEDED",
  /** Another configured approval condition applies. */
  APPROVAL_REQUIRED = "APPROVAL_REQUIRED",
  /**
   * The purchase satisfies all automatic checks.
   * Historical: only records judged before trust mode (16 oct 2026) carry this
   * code. The trust path returns ON_TRUST_LIST instead.
   */
  WITHIN_LIMITS = "WITHIN_LIMITS",
  /** The purchase exactly matches an entry on the owner's trust list. */
  ON_TRUST_LIST = "ON_TRUST_LIST",
  /** No entry on the trust list has this payee and purpose; the owner must decide. */
  NOT_ON_TRUST_LIST = "NOT_ON_TRUST_LIST",
  /** The payee and purpose are listed, but the amount differs from the listed price. */
  AMOUNT_OFF_TRUST_LIST = "AMOUNT_OFF_TRUST_LIST",
  /** The monthly auto budget has no room for this purchase; the owner must decide. */
  AUTO_BUDGET_USED = "AUTO_BUDGET_USED",
  /**
   * The rules already auto-paid this exact purchase this monthly period, so a
   * repeat is never auto-paid; the owner must decide (owner decision, 18 oct
   * 2026). Without this, an agent that can read the rules could drain the auto
   * budget by repeating one listed item.
   */
  ALREADY_AUTO_PAID = "ALREADY_AUTO_PAID",
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
 * One exact purchase the owner's trust list clears automatically.
 *
 * Matching is exact on all three fields: the same payee, the same purpose, and
 * the same price to the minor unit. A near miss is not a match; it asks. The
 * entries come from the catalog through the Rules page, so payee and purpose
 * are the catalog's own verbatim strings.
 */
export interface AutoAllowlistEntry {
  /** Merchant / payee, matched verbatim against the request. */
  payee: string;
  /** Purpose, matched verbatim against the request. */
  purpose: string;
  /** The exact price the owner set, in minor units. */
  amountMinor: number;
}

/**
 * The user-configured rules that limit what the agent may spend.
 */
export interface SpendingRules {
  /** Version tag of this rule set; recorded with every decision. */
  ruleVersion: string;
  /** Currency these rules are denominated in. */
  currency: string;
  /**
   * Retired (trust mode, 16 oct 2026): the engine no longer reads this line.
   * Still stored and parsed so historical rule sets round-trip unchanged.
   */
  perPurchaseAutoLimitMinor: number;
  /** Hard monthly ceiling. Approval may never override this. */
  monthlyCapMinor: number;
  /** Only these categories may be paid. An empty list permits nothing. */
  permittedCategories: string[];
  /**
   * Retired (trust mode, 16 oct 2026): the trust list defines trusted payees;
   * the engine no longer reads this flag. Still stored and parsed.
   */
  requireApprovalForNewPayee: boolean;
  /**
   * Trust mode (owner decision, 16 oct 2026): when false (the default, and
   * what every rule set parses to unless the owner switched it on), EVERY
   * request inside the hard cap asks. When true, the trust list below is the
   * one and only automatic path.
   */
  autoApproveEnabled: boolean;
  /**
   * The owner's exact-price trust list. Optional on the interface: a missing
   * list means an EMPTY list, so nothing ever matches and everything asks.
   * `parseRules` normalizes it to a present array on every parsed value.
   */
  autoAllowlist?: readonly AutoAllowlistEntry[];
  /**
   * The monthly ceiling for AUTOMATIC spending, a second limit under the hard
   * cap. Optional: missing means 0, and a zero budget auto-pays nothing.
   * Counted only from confirmed payments of auto-approved requests.
   */
  autoBudgetMinor?: number;
}

/**
 * The material details of a purchase the owner's rules already auto-paid this
 * monthly period: exactly the facts the request fingerprint hashes (amount,
 * currency, payee, purpose, category). The engine compares a new request
 * against these to enforce "each exact purchase auto-pays once a month".
 */
export interface AutoPaidPurchase {
  /** Merchant / payee, matched verbatim. */
  payee: string;
  /** Purpose, matched verbatim. */
  purpose: string;
  /** Category key, matched verbatim. */
  category: string;
  /** Integer amount in minor units. */
  amountMinor: number;
  /** ISO 4217 currency code. */
  currency: string;
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
  /**
   * Verified captures this monthly period that belong to requests the owner's
   * rules cleared automatically. Optional: missing means 0, the safe direction.
   */
  autoSpentThisMonthMinor?: number;
  /**
   * Material details of the purchases the rules already AUTO-PAID (capture
   * verified) this monthly period. Optional: missing means an empty list, so
   * states computed before the once-a-month rule (18 oct 2026) still parse.
   * A matching repeat asks the owner instead of auto-paying.
   */
  autoPaidThisMonth?: readonly AutoPaidPurchase[];
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
