/**
 * Runtime validation for untrusted input.
 *
 * The agent, the browser, and external services are all untrusted. Anything
 * that reaches the engine is parsed here first. Validation never *assumes* a
 * value is safe: malformed or missing input fails closed and is reported so the
 * engine can deny it.
 */

import type { PurchaseRequest, SpendingRules, SpendingState } from "./types";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Best-effort read of the rule version, used only so that failure decisions can
 * still record which rules were in play. Never throws.
 */
export function readRuleVersion(rules: unknown): string {
  if (isRecord(rules) && isNonEmptyString(rules.ruleVersion)) {
    return rules.ruleVersion;
  }
  return "unknown";
}

export function parseRequest(input: unknown): ParseResult<PurchaseRequest> {
  if (!isRecord(input)) {
    return { ok: false, reason: "Request must be an object." };
  }

  const { id, agentId, payee, purpose, category, amountMinor, currency } = input;

  if (!isNonEmptyString(id)) return { ok: false, reason: "id is required." };
  if (!isNonEmptyString(agentId)) return { ok: false, reason: "agentId is required." };
  if (!isNonEmptyString(payee)) return { ok: false, reason: "payee is required." };
  if (!isNonEmptyString(purpose)) return { ok: false, reason: "purpose is required." };
  if (!isNonEmptyString(category)) return { ok: false, reason: "category is required." };
  if (!isSafeInteger(amountMinor)) {
    return { ok: false, reason: "amountMinor must be an integer number of minor units." };
  }
  if (!isNonEmptyString(currency)) return { ok: false, reason: "currency is required." };

  return {
    ok: true,
    value: { id, agentId, payee, purpose, category, amountMinor, currency },
  };
}

export function parseRules(input: unknown): ParseResult<SpendingRules> {
  if (!isRecord(input)) {
    return { ok: false, reason: "Spending rules must be an object." };
  }

  const {
    ruleVersion,
    currency,
    perPurchaseAutoLimitMinor,
    monthlyCapMinor,
    permittedCategories,
    requireApprovalForNewPayee,
    autoApproveEnabled,
  } = input;

  if (!isNonEmptyString(ruleVersion)) return { ok: false, reason: "ruleVersion is required." };
  if (!isNonEmptyString(currency)) return { ok: false, reason: "rules currency is required." };
  if (!isNonNegativeSafeInteger(perPurchaseAutoLimitMinor)) {
    return { ok: false, reason: "perPurchaseAutoLimitMinor must be a non-negative integer." };
  }
  if (!isNonNegativeSafeInteger(monthlyCapMinor)) {
    return { ok: false, reason: "monthlyCapMinor must be a non-negative integer." };
  }
  if (!isStringArray(permittedCategories)) {
    return { ok: false, reason: "permittedCategories must be an array of strings." };
  }
  if (typeof requireApprovalForNewPayee !== "boolean") {
    return { ok: false, reason: "requireApprovalForNewPayee must be a boolean." };
  }
  // Optional at the boundary: rule sets saved before Option 1 do not carry the
  // flag. Anything other than an explicit `true` fails safe to false, so a
  // missing or malformed flag means auto-approve OFF (every request asks).
  if (autoApproveEnabled !== undefined && typeof autoApproveEnabled !== "boolean") {
    return { ok: false, reason: "autoApproveEnabled must be a boolean when present." };
  }

  return {
    ok: true,
    value: {
      ruleVersion,
      currency,
      perPurchaseAutoLimitMinor,
      monthlyCapMinor,
      permittedCategories,
      requireApprovalForNewPayee,
      autoApproveEnabled: autoApproveEnabled === true,
    },
  };
}

export function parseState(input: unknown): ParseResult<SpendingState> {
  if (!isRecord(input)) {
    return { ok: false, reason: "Spending state must be an object." };
  }

  const { spentThisMonthMinor, knownPayees } = input;

  if (!isNonNegativeSafeInteger(spentThisMonthMinor)) {
    return { ok: false, reason: "spentThisMonthMinor must be a non-negative integer." };
  }
  if (!isStringArray(knownPayees)) {
    return { ok: false, reason: "knownPayees must be an array of strings." };
  }

  return { ok: true, value: { spentThisMonthMinor, knownPayees } };
}
