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
  // ALLOW only exists on records ruled by older rules (auto-approve is off
  // now), and even then it only ever meant "ready to pay", never "paid".
  if (decision === "ALLOW") return "Within your limits.";
  if (decision === "ASK") {
    switch (reasonCode) {
      case "APPROVAL_REQUIRED":
        // Option 1: the standing reason everything asks. Older files where it
        // meant "first-time seller" stay true: it needed their okay then too.
        return "It needs your okay before anything happens.";
      case "PER_PURCHASE_LIMIT_EXCEEDED":
        // Only records ruled before Option 1 can carry this code.
        return "Over the auto-approve line in force at the time, so it needed your okay.";
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
      // Option 1: every purchase asks, so this code now means simply that.
      return "your okay needed";
    case "PER_PURCHASE_LIMIT_EXCEEDED":
      // Only pre-Option-1 records carry this code.
      return "over the old auto line";
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
      return "You said yes. Getting ready to pay.";
    case "AUTHORIZED":
      // Legacy state: older rules cleared small purchases without asking.
      // Today's gate re-checks them and asks, so they never pay like this.
      return "Cleared by older rules. The gate asks you first now.";
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
      return "from older rules";
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
