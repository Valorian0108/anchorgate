/**
 * Display vocabulary: statuses, decisions, and reason codes from the core,
 * rendered in plain, everyday language an owner can read cold.
 *
 * Voice rules (owner-approved): second person, active, one idea per line,
 * no raw reason-codes on screen, no em dashes, no jargon, no fake enthusiasm.
 */

import type { AuthorizationDecision, ReasonCode } from "@/core/authorization";
import type { Evaluation, RequestStatus } from "@/core/purchases";

/** The one-line "what happened and why" for a decision, in plain words. */
export function checkText(decision: AuthorizationDecision, reasonCode: ReasonCode): string {
  if (decision === "ALLOW") return "Within your limits, so it can go ahead.";
  if (decision === "ASK") {
    switch (reasonCode) {
      case "APPROVAL_REQUIRED":
        return "A payee you have not paid before, so it needs your okay.";
      case "PER_PURCHASE_LIMIT_EXCEEDED":
        return "Over your auto-approve line, so it needs your okay.";
      default:
        return "It needs your okay before anything happens.";
    }
  }
  // DENY
  switch (reasonCode) {
    case "MONTHLY_CAP_EXCEEDED":
      return "Over your monthly limit, so it is a no.";
    case "CATEGORY_NOT_PERMITTED":
      return "Not one of your allowed categories, so it is a no.";
    case "CURRENCY_MISMATCH":
      return "Not in your currency, so it is a no.";
    case "INVALID_AMOUNT":
      return "The amount does not look right, so it is a no.";
    case "INVALID_REQUEST":
      return "The request is missing something, so it is a no.";
    case "INVALID_RULES":
      return "Your rules could not be read, so nothing is approved.";
    case "INVALID_STATE":
      return "The spending record could not be read, so nothing is approved.";
    default:
      return "It is a no.";
  }
}

/** Short noun phrase for a reason code, for dense registers (the Record). */
export function reasonPhrase(reasonCode: ReasonCode): string {
  switch (reasonCode) {
    case "APPROVAL_REQUIRED":
      return "new payee";
    case "PER_PURCHASE_LIMIT_EXCEEDED":
      return "over your auto line";
    case "MONTHLY_CAP_EXCEEDED":
      return "over monthly limit";
    case "CATEGORY_NOT_PERMITTED":
      return "category not allowed";
    case "CURRENCY_MISMATCH":
      return "wrong currency";
    case "INVALID_AMOUNT":
      return "bad amount";
    case "INVALID_REQUEST":
      return "incomplete request";
    case "INVALID_RULES":
      return "rules unreadable";
    case "INVALID_STATE":
      return "record unreadable";
    case "WITHIN_LIMITS":
      return "within limits";
    default:
      return "denied";
  }
}

/** Fallback when a record has no recorded evaluation yet. */
export function checkTextForStatus(status: RequestStatus): string {
  switch (status) {
    case "PENDING_APPROVAL":
      return "Waiting on you.";
    case "APPROVED":
    case "AUTHORIZED":
      return "You said yes. Getting ready to pay.";
    case "PENDING_SETTLEMENT":
      return "Paid, waiting for it to settle.";
    case "EXECUTED":
      return "Paid and confirmed.";
    case "REJECTED":
      return "You said no.";
    case "DENIED":
      return "The rules said no.";
  }
}

/** The quiet final-state word shown in the action column. */
export function stateWord(status: RequestStatus): string {
  switch (status) {
    case "PENDING_APPROVAL":
      return "waiting on you";
    case "AUTHORIZED":
      return "ready";
    case "APPROVED":
      return "paying";
    case "PENDING_SETTLEMENT":
      return "settling";
    case "EXECUTED":
      return "paid";
    case "REJECTED":
      return "you said no";
    case "DENIED":
      return "not allowed";
  }
}

/**
 * REJECTED is shown as plain text, never a verdict chip (per the constraints).
 *
 * The chip shows the CURRENT standing, not the engine's recorded word: a
 * resolved request (approved / executed / settling) reads Allowed even when the
 * recorded evaluation was ASK, because the ask is exactly why the owner decided.
 * Pending and denied keep the recorded engine word.
 */
export function chipFor(
  decision: AuthorizationDecision | null,
  status: RequestStatus,
): { label: string; className: string } | null {
  if (status === "REJECTED") return null;
  const standing =
    status === "PENDING_APPROVAL"
      ? decision ?? "ASK"
      : status === "DENIED"
        ? decision ?? "DENY"
        : "ALLOW";
  const label =
    standing === "ALLOW" ? "Allowed" : standing === "ASK" ? "Needs you" : "Blocked";
  return {
    label,
    className: standing === "ALLOW" ? "chip-allow" : standing === "ASK" ? "chip-ask" : "chip-deny",
  };
}

/** Latest recorded evaluation of a record, if any. */
export function latestEvaluation(
  evaluations: Evaluation[] | undefined,
): Evaluation | null {
  if (!evaluations || evaluations.length === 0) return null;
  return evaluations[evaluations.length - 1] ?? null;
}

/** Reason code in slug form, e.g. WITHIN_LIMITS → within-limits. */
export function reasonSlug(reasonCode: ReasonCode): string {
  return reasonCode.toLowerCase().replace(/_/g, "-");
}

/** The engine's verdict word in plain everyday language. */
export function decisionWord(decision: AuthorizationDecision): string {
  if (decision === "ALLOW") return "allowed";
  if (decision === "ASK") return "needs you";
  return "blocked";
}

/** Statuses whose amount still counts against the month (not yet captured or closed). */
export function isReserved(status: RequestStatus): boolean {
  return (
    status === "PENDING_APPROVAL" ||
    status === "APPROVED" ||
    status === "AUTHORIZED" ||
    status === "PENDING_SETTLEMENT"
  );
}
