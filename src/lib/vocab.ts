/**
 * Display vocabulary: statuses, decisions, and reason codes from the core
 * rendered in the ledger language used by the approved comps.
 */

import type {
  AuthorizationDecision,
  DecisionResult,
  ReasonCode,
} from "@/core/authorization";
import type { Evaluation, RequestStatus } from "@/core/purchases";

/** The one-line "what happened" for a decision — mirrors the comps exactly. */
export function checkText(decision: AuthorizationDecision, reasonCode: ReasonCode): string {
  if (decision === "ALLOW") return "within limits → allow";
  if (decision === "ASK") {
    switch (reasonCode) {
      case "APPROVAL_REQUIRED":
        return "new payee → human";
      case "PER_PURCHASE_LIMIT_EXCEEDED":
        return "above the line → human";
      default:
        return "approval required → human";
    }
  }
  // DENY
  switch (reasonCode) {
    case "MONTHLY_CAP_EXCEEDED":
      return "monthly cap → deny";
    case "CATEGORY_NOT_PERMITTED":
      return "category not permitted → deny";
    case "CURRENCY_MISMATCH":
      return "currency mismatch → deny";
    case "INVALID_AMOUNT":
      return "invalid amount → deny";
    case "INVALID_REQUEST":
      return "invalid request → deny";
    case "INVALID_RULES":
      return "rules unreadable → deny";
    case "INVALID_STATE":
      return "state unreadable → deny";
    default:
      return "denied";
  }
}

/** Short noun phrase for a reason code — for dense registers (the Record). */
export function reasonPhrase(reasonCode: ReasonCode): string {
  switch (reasonCode) {
    case "APPROVAL_REQUIRED":
      return "new payee";
    case "PER_PURCHASE_LIMIT_EXCEEDED":
      return "above the line";
    case "MONTHLY_CAP_EXCEEDED":
      return "monthly cap";
    case "CATEGORY_NOT_PERMITTED":
      return "category not permitted";
    case "CURRENCY_MISMATCH":
      return "currency mismatch";
    case "INVALID_AMOUNT":
      return "invalid amount";
    case "INVALID_REQUEST":
      return "invalid request";
    case "INVALID_RULES":
      return "rules unreadable";
    case "INVALID_STATE":
      return "state unreadable";
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
      return "awaiting a human";
    case "APPROVED":
    case "AUTHORIZED":
      return "within limits → allow";
    case "PENDING_SETTLEMENT":
      return "capture settling";
    case "EXECUTED":
      return "verified capture";
    case "REJECTED":
      return "rejected by owner";
    case "DENIED":
      return "denied";
  }
}

/** The quiet final-state word shown in the action column. */
export function stateWord(status: RequestStatus): string {
  switch (status) {
    case "PENDING_APPROVAL":
      return "awaiting";
    case "AUTHORIZED":
      return "ready";
    case "APPROVED":
      return "executing";
    case "PENDING_SETTLEMENT":
      return "settling";
    case "EXECUTED":
      return "verified";
    case "REJECTED":
      return "rejected";
    case "DENIED":
      return "closed";
  }
}

/**
 * REJECTED is shown as plain text — never a verdict chip (per the constraints).
 *
 * The chip shows the CURRENT standing, not the engine's recorded word: a
 * resolved request (approved / executed / settling) reads ALLOW even when the
 * recorded evaluation was ASK — the ask is exactly why the owner decided.
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
  return {
    label: standing,
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

/** Statuses whose amount still counts against the month (not yet captured or closed). */
export function isReserved(status: RequestStatus): boolean {
  return (
    status === "PENDING_APPROVAL" ||
    status === "APPROVED" ||
    status === "AUTHORIZED" ||
    status === "PENDING_SETTLEMENT"
  );
}