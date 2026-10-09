/**
 * The independent authorization engine.
 *
 * This is the security boundary of the product. It is a PURE, DETERMINISTIC
 * function: the same inputs always produce the same output. It does not call the
 * AI, the network, the database, or the UI. It does not "ask the model" whether
 * a purchase is allowed. The AI may *propose*; only this code *decides*.
 *
 * Decision order (approved):
 *   1. Validate the request (malformed/missing fails safe -> DENY)
 *   2. Reject zero / negative amounts
 *   3. Reject a currency that does not match the configured rules
 *   4. Reject a category that is not explicitly permitted
 *   5. Reject if it would exceed the HARD monthly cap (approval cannot override)
 *   6. ASK if above the per-purchase limit, or another approval condition applies
 *   7. Otherwise ALLOW
 *
 * The strictest answer always wins: DENY > ASK > ALLOW.
 */

import {
  type AuthorizationDecision,
  type DecisionResult,
  ReasonCode,
} from "./types";
import { parseRequest, parseRules, parseState, readRuleVersion } from "./validation";

function result(
  decision: AuthorizationDecision,
  reasonCode: ReasonCode,
  reason: string,
  ruleVersion: string,
): DecisionResult {
  return { decision, reasonCode, reason, ruleVersion };
}

function deny(reasonCode: ReasonCode, reason: string, ruleVersion: string): DecisionResult {
  return result("DENY", reasonCode, reason, ruleVersion);
}

function ask(reasonCode: ReasonCode, reason: string, ruleVersion: string): DecisionResult {
  return result("ASK", reasonCode, reason, ruleVersion);
}

function allow(reasonCode: ReasonCode, reason: string, ruleVersion: string): DecisionResult {
  return result("ALLOW", reasonCode, reason, ruleVersion);
}

/**
 * Evaluate a proposed purchase against the current rules and spending state.
 *
 * All three arguments are treated as untrusted and validated internally; pass
 * raw values (e.g. from the agent or storage) directly.
 */
export function evaluatePurchase(
  request: unknown,
  rules: unknown,
  state: unknown,
): DecisionResult {
  const ruleVersion = readRuleVersion(rules);

  // 1. Validate the request. Missing/malformed input must never be permission.
  const parsedRequest = parseRequest(request);
  if (!parsedRequest.ok) {
    return deny(
      ReasonCode.INVALID_REQUEST,
      `Purchase request is missing or malformed; failing safe (no spend). ${parsedRequest.reason}`,
      ruleVersion,
    );
  }

  // Rules and state must be readable. If not, we cannot authorize anything.
  const parsedRules = parseRules(rules);
  if (!parsedRules.ok) {
    return deny(
      ReasonCode.INVALID_RULES,
      `Spending rules are missing or malformed; failing safe (no spend). ${parsedRules.reason}`,
      ruleVersion,
    );
  }

  const parsedState = parseState(state);
  if (!parsedState.ok) {
    return deny(
      ReasonCode.INVALID_STATE,
      `Spending state could not be read reliably; failing safe (no spend). ${parsedState.reason}`,
      ruleVersion,
    );
  }

  const req = parsedRequest.value;
  const cfg = parsedRules.value;
  const spent = parsedState.value;

  // 2. Amounts must be positive.
  if (req.amountMinor <= 0) {
    return deny(
      ReasonCode.INVALID_AMOUNT,
      `Amount must be greater than zero (received ${req.amountMinor} minor units).`,
      ruleVersion,
    );
  }

  // 3. Currency must match the rules; the MVP does no currency exchange.
  if (req.currency !== cfg.currency) {
    return deny(
      ReasonCode.CURRENCY_MISMATCH,
      `Request currency ${req.currency} does not match the configured currency ${cfg.currency}.`,
      ruleVersion,
    );
  }

  // 4. Category must be explicitly permitted. Unknown or empty categories fail.
  if (!cfg.permittedCategories.includes(req.category)) {
    return deny(
      ReasonCode.CATEGORY_NOT_PERMITTED,
      `Category "${req.category}" is not permitted.`,
      ruleVersion,
    );
  }

  // 5. HARD monthly cap. Checked before any approval condition, so approval can
  //    never override it (strictest answer wins).
  const remainingMinor = cfg.monthlyCapMinor - spent.spentThisMonthMinor;
  if (req.amountMinor > remainingMinor) {
    const remainingForDisplay = Math.max(remainingMinor, 0);
    return deny(
      ReasonCode.MONTHLY_CAP_EXCEEDED,
      `Purchase of ${req.amountMinor} minor units would exceed the remaining monthly budget of ` +
        `${remainingForDisplay} (cap ${cfg.monthlyCapMinor}, already spent ${spent.spentThisMonthMinor}).`,
      ruleVersion,
    );
  }

  // 6. Approval conditions (soft constraints).
  if (req.amountMinor > cfg.perPurchaseAutoLimitMinor) {
    return ask(
      ReasonCode.PER_PURCHASE_LIMIT_EXCEEDED,
      `Amount ${req.amountMinor} exceeds the automatic per-purchase limit of ` +
        `${cfg.perPurchaseAutoLimitMinor}; human approval required.`,
      ruleVersion,
    );
  }

  if (cfg.requireApprovalForNewPayee && !spent.knownPayees.includes(req.payee)) {
    return ask(
      ReasonCode.APPROVAL_REQUIRED,
      `Payee "${req.payee}" has not been seen before; human approval required.`,
      ruleVersion,
    );
  }

  // 7. Passed every check.
  return allow(
    ReasonCode.WITHIN_LIMITS,
    "Within the automatic per-purchase limit and the monthly budget.",
    ruleVersion,
  );
}
