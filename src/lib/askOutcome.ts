/**
 * Outcomes of the Gate's "ask the assistant" box, in plain language.
 *
 * The box must never lie and never stay silent. Every ask ends in one of a
 * small set of outcomes (filed and allowed, filed and needs you, filed and
 * blocked, auto-paid by the owner's trust list, cleared but the payment did
 * not go through, not filed at all, assistant asked for more detail, assistant
 * unreachable), and each outcome maps to one honest sentence built from the
 * engine's own reason codes. The outcome travels back to the Gate as short
 * URL codes (`ask`, `why`, `ref`), never as free text.
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
  | { kind: "filed"; decision: AuthorizationDecision; reasonCode: ReasonCode; requestId?: string }
  | { kind: "unfiled"; reasonCode: ReasonCode }
  /** Trust mode: the rules cleared it and the capture is done (or settling). */
  | { kind: "paid"; ref?: string }
  /** Trust mode: the rules cleared it but the provider did not take the payment. */
  | { kind: "stalled" };

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
  ReasonCode.ON_TRUST_LIST,
  ReasonCode.NOT_ON_TRUST_LIST,
  ReasonCode.AMOUNT_OFF_TRUST_LIST,
  ReasonCode.AUTO_BUDGET_USED,
  ReasonCode.ALREADY_AUTO_PAID,
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
    case "paid":
      // The ref can carry the display ellipsis (shortRef), which is not
      // header-safe: redirect URLs travel as x-action-redirect, so the value
      // is percent-encoded. Search params decode it back automatically.
      return outcome.ref
        ? `/?ask=paid&ref=${encodeURIComponent(outcome.ref)}`
        : "/?ask=paid";
    case "stalled":
      return "/?ask=stalled";
    case "filed":
      if (outcome.decision === "ALLOW") return "/?ask=allow";
      if (outcome.decision === "ASK") {
        // The standing ask keeps its bare code (pinned). A trust-mode reason
        // rides along on `why`, so the gate can name it in the sentence.
        return outcome.reasonCode === ReasonCode.APPROVAL_REQUIRED
          ? "/?ask=needs"
          : `/?ask=needs&why=${reasonSlug(outcome.reasonCode)}`;
      }
      return `/?ask=blocked&why=${reasonSlug(outcome.reasonCode)}`;
    case "unfiled":
      return `/?ask=unfiled&why=${reasonSlug(outcome.reasonCode)}`;
  }
}

/** The one honest sentence the Gate shows for an outcome. */
export function askMessageFor(
  ask: string | undefined,
  why: string | undefined,
  ref?: string | undefined,
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
      // Rare now: a filed ALLOW is normally settled into "paid" or "stalled"
      // by trust mode before the redirect. If it ever shows, it says only
      // what is true: the rules cleared it. Never "ready to pay when you
      // press pay", because a cleared record is not something the Gate pays.
      return {
        text: "Added below. Your rules cleared it.",
        error: false,
      };
    case "paid":
      // Trust mode: the exact item at the exact listed price, inside the auto
      // budget. The sentence claims a payment only when a capture is real.
      return {
        text: ref
          ? `Your rules cleared this at the exact price on your list, and it is paid. Reference ${ref}.`
          : "Your rules cleared this at the exact price on your list, and it is paid.",
        error: false,
      };
    case "stalled":
      return {
        text: "Your rules cleared it, but the payment did not go through. No money moved.",
        error: true,
      };
    case "needs": {
      // The standing sentence stays exactly as shipped. A trust-mode reason
      // (off-list, price mismatch, budget used up) replaces the tail, so the
      // ask explains itself right at the gate.
      if (code && code !== ReasonCode.APPROVAL_REQUIRED) {
        return {
          text: `Added below. It needs your okay: ${reasonPhrase(code)}.`,
          error: false,
        };
      }
      return {
        text: "Added below. It needs your okay before any money moves.",
        error: false,
      };
    }
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
