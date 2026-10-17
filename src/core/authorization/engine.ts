/**
 * The independent authorization engine.
 *
 * This is the security boundary of the product. It is a PURE, DETERMINISTIC
 * function: the same inputs always produce the same output. It does not call the
 * AI, the network, the database, or the UI. It does not "ask the model" whether
 * a purchase is allowed. The AI may *propose*; only this code *decides*.
 *
 * Decision order (approved; trust mode 16 oct 2026):
 *   1. Validate the request (malformed/missing fails safe -> DENY)
 *   2. Reject zero / negative amounts
 *   3. Reject a currency that does not match the configured rules
 *   4. Reject a category that is not explicitly permitted
 *   5. Reject if it would exceed the HARD monthly cap (approval cannot override)
 *   6. ASK unless the rules explicitly enable auto-approve. The toggle ships
 *      OFF, so by default every request inside the cap needs the owner. When
 *      it IS on, the owner's exact-price trust list is the one automatic path:
 *      ASK when the seller/purpose is not listed, when the price differs from
 *      the listed price, or when the monthly auto budget has no room.
 *   7. Otherwise (exact list match, inside the auto budget) ALLOW
 *
 * Retired: the per-purchase auto line and the new-payee check. Their reason
 * codes (PER_PURCHASE_LIMIT_EXCEEDED, and APPROVAL_REQUIRED for unseen payees)
 * survive only on historical records; the trust list replaced both.
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

  // 6. Human approval. Auto-approve is OFF unless the rules explicitly enable
  //    it (trust mode, owner decision 16 oct 2026: the toggle ships off), so
  //    every request that passes the hard checks still waits for the owner.
  if (!cfg.autoApproveEnabled) {
    return ask(
      ReasonCode.APPROVAL_REQUIRED,
      "Auto-approve is off; every purchase needs the owner's approval.",
      ruleVersion,
    );
  }

  // Trust mode (owner decision 16 oct 2026): the owner's exact-price list is
  // the ONE automatic path. The old per-purchase auto line and new-payee check
  // are retired; their reason codes survive only on historical records.

  // 6a. The seller and purpose must both appear on the trust list. A missing
  //     list parses to empty, so nothing matches and everything asks.
  const allowlist = cfg.autoAllowlist ?? [];
  const candidates = allowlist.filter(
    (item) => item.payee === req.payee && item.purpose === req.purpose,
  );
  if (candidates.length === 0) {
    return ask(
      ReasonCode.NOT_ON_TRUST_LIST,
      `"${req.payee}" for "${req.purpose}" is not on the owner's trust list; ` +
        "human approval required.",
      ruleVersion,
    );
  }

  // 6b. The price must match a listed price exactly (the same seller and
  //     purpose may be listed at more than one exact price). A different
  //     amount is never auto-declined and never auto-paid: it asks, with both
  //     numbers.
  const entry = candidates.find((item) => item.amountMinor === req.amountMinor);
  if (!entry) {
    return ask(
      ReasonCode.AMOUNT_OFF_TRUST_LIST,
      `"${req.payee}" for "${req.purpose}" arrived at ${req.amountMinor} minor units, ` +
        `but the trust list says ${candidates[0]!.amountMinor}; human approval required.`,
      ruleVersion,
    );
  }

  // 6c. The auto budget is a second ceiling under the hard cap, counted only
  //     from confirmed payments of earlier auto-approved requests. A missing
  //     budget figure parses to 0, and a zero budget auto-pays nothing.
  const autoBudget = cfg.autoBudgetMinor ?? 0;
  const autoSpent = spent.autoSpentThisMonthMinor ?? 0;
  if (autoSpent + req.amountMinor > autoBudget) {
    return ask(
      ReasonCode.AUTO_BUDGET_USED,
      `The monthly auto budget has no room for ${req.amountMinor} minor units ` +
        `(budget ${autoBudget}, already auto-spent ${autoSpent}); human approval required.`,
      ruleVersion,
    );
  }

  // 7. On the list, at the exact price, inside the auto budget, and inside
  //    every hard check above. This is the only way a purchase clears without
  //    the owner.
  return allow(
    ReasonCode.ON_TRUST_LIST,
    `"${req.payee}" for "${req.purpose}" at ${req.amountMinor} minor units exactly matches ` +
      "the trust list, inside the auto budget and the monthly cap.",
    ruleVersion,
  );
}
