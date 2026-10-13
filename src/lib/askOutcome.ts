/**
 * Outcomes of the Gate's "ask the assistant" box, in plain language.
 *
 * The box must never lie and never stay silent. Every ask ends in one of a
 * small set of outcomes (filed and allowed, filed and needs you, filed and
 * blocked, not filed at all, assistant asked for more detail, assistant
 * unreachable), and each outcome maps to one honest sentence built from the
 * engine's own reason codes. The outcome travels back to the Gate as two short
 * URL codes (`ask`, `why`), never as free text.
 */

import {
  ReasonCode,
  type AuthorizationDecision,
  type SpendingRules,
} from "@/core/authorization";

import { reasonPhrase, reasonSlug } from "./vocab";

/** What happened to one ask, derived from the agent run (or its failure). */
export type AskOutcome =
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "clarify" }
  | { kind: "filed"; decision: AuthorizationDecision; reasonCode: ReasonCode }
  | { kind: "unfiled"; reasonCode: ReasonCode };

/** Every reason code the engine can produce, for slug round-tripping. */
const REASON_CODES: ReasonCode[] = [
  ReasonCode.INVALID_REQUEST,
  ReasonCode.INVALID_RULES,
  ReasonCode.INVALID_STATE,
  ReasonCode.INVALID_AMOUNT,
  ReasonCode.CURRENCY_MISMATCH,
  ReasonCode.CATEGORY_NOT_PERMITTED,
  ReasonCode.MONTHLY_CAP_EXCEEDED,
  ReasonCode.PER_PURCHASE_LIMIT_EXCEEDED,
  ReasonCode.APPROVAL_REQUIRED,
  ReasonCode.WITHIN_LIMITS,
];

/** Reverse of `reasonSlug`, for the `why` URL code. Unknown slugs give null. */
export function reasonFromSlug(slug: string | undefined): ReasonCode | null {
  if (!slug) return null;
  return REASON_CODES.find((code) => reasonSlug(code) === slug) ?? null;
}

/**
 * The front-door reason for a tool input that never reached the engine,
 * because the tool contract rejected it first. Mirrors the engine's own order:
 * shape, then amount, then currency, then category.
 */
export function frontDoorReason(
  input: unknown,
  rules: SpendingRules | null,
): ReasonCode {
  if (!rules) return ReasonCode.INVALID_RULES;

  const fields = (input ?? {}) as Record<string, unknown>;
  const filled = (value: unknown): boolean =>
    typeof value === "string" && value.trim() !== "";

  if (
    !filled(fields.payee) ||
    !filled(fields.purpose) ||
    !filled(fields.category) ||
    !filled(fields.currency)
  ) {
    return ReasonCode.INVALID_REQUEST;
  }

  const amount = fields.amountMinor;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return ReasonCode.INVALID_AMOUNT;
  }
  if (
    typeof fields.currency === "string" &&
    fields.currency.toUpperCase() !== rules.currency.toUpperCase()
  ) {
    return ReasonCode.CURRENCY_MISMATCH;
  }
  if (
    typeof fields.category === "string" &&
    !rules.permittedCategories.includes(fields.category)
  ) {
    return ReasonCode.CATEGORY_NOT_PERMITTED;
  }
  return ReasonCode.INVALID_REQUEST;
}

/** The Gate path (short codes only) that carries an outcome back to the owner. */
export function askPathFor(outcome: AskOutcome): string {
  switch (outcome.kind) {
    case "empty":
      return "/?ask=empty";
    case "error":
      return "/?ask=error";
    case "clarify":
      return "/?ask=clarify";
    case "filed":
      if (outcome.decision === "ALLOW") return "/?ask=allow";
      if (outcome.decision === "ASK") return "/?ask=needs";
      return `/?ask=blocked&why=${reasonSlug(outcome.reasonCode)}`;
    case "unfiled":
      return `/?ask=unfiled&why=${reasonSlug(outcome.reasonCode)}`;
  }
}

/** The one honest sentence the Gate shows for an outcome. */
export function askMessageFor(
  ask: string | undefined,
  why: string | undefined,
): { text: string; error: boolean } | null {
  const code = reasonFromSlug(why);
  switch (ask) {
    case "empty":
      return { text: "Type what you want looked at first, then ask.", error: false };
    case "error":
      return {
        text: "The assistant could not reach the model right now. Try again in a moment.",
        error: true,
      };
    case "clarify":
      return {
        text: "Nothing was added below. Tell it the amount, the seller, what it is for, and what kind of purchase it is (for example software, books, or meals), then ask again.",
        error: false,
      };
    case "allow":
      // Unreachable while auto-approve is off (Option 1): every filed request
      // comes back "needs". Kept honest anyway for a future trust-based mode:
      // even then, "allowed" only ever meant ready to pay, never paid.
      return {
        text: "Added below. Your rules cleared it, so it is ready to pay when you press pay.",
        error: false,
      };
    case "needs":
      return {
        text: "Added below. It needs your okay before any money moves.",
        error: false,
      };
    case "blocked":
      return {
        text: code
          ? `Added below. Your rules blocked it: ${reasonPhrase(code)}.`
          : "Added below. Your rules blocked it.",
        error: false,
      };
    case "unfiled":
      return {
        text: code
          ? `I could not file that one: ${reasonPhrase(code)}. Nothing was added below.`
          : "I could not file that one. Nothing was added below.",
        error: true,
      };
    case "norules":
      return {
        text: "Nothing was added. Your gate has no rules yet, so nothing can be approved. Set your monthly limit on the Rules page, then ask again.",
        error: false,
      };
    default:
      return null;
  }
}
