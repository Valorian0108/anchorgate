/**
 * Translation between database rows and the core's domain types.
 *
 * Kept in one place so the stores stay small and the mapping is easy to audit.
 * Reads validate enumerations defensively: if the database ever contained an
 * unknown status/kind/context, we fail loudly rather than silently coerce it.
 */

import { parseRules } from "../../core/authorization";
import type { SpendingRules } from "../../core/authorization";
import type {
  Evaluation,
  EvaluationContext,
  PurchaseRecord,
  RequestStatus,
} from "../../core/purchases";
import type { SpendingEvent, SpendingEventKind } from "../../core/spending";
import { SPENDING_EVENT_KINDS } from "../../core/spending";
import type {
  evaluations,
  purchaseRequests,
  spendingEvents,
  spendingRules,
} from "./schema";

type PurchaseRow = typeof purchaseRequests.$inferSelect;
type EvaluationRow = typeof evaluations.$inferSelect;
type SpendingRow = typeof spendingEvents.$inferSelect;
type RulesRow = typeof spendingRules.$inferSelect;

/** The fixed primary key of the single global rules row (MVP). */
export const ACTIVE_RULES_ID = "active";

const REQUEST_STATUSES: readonly RequestStatus[] = [
  "DENIED",
  "AUTHORIZED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
];

const EVALUATION_CONTEXTS: readonly EvaluationContext[] = [
  "PROPOSAL",
  "APPROVAL",
  "PRE_EXECUTION",
];

function assertOneOf<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`Unrecognized ${label} in storage: ${JSON.stringify(value)}`);
}

/** Values to insert/update for a purchase_request row. */
export function toPurchaseRow(record: PurchaseRecord): typeof purchaseRequests.$inferInsert {
  return {
    id: record.id,
    agentId: record.request.agentId,
    payee: record.request.payee,
    purpose: record.request.purpose,
    category: record.request.category,
    amountMinor: record.request.amountMinor,
    currency: record.request.currency,
    fingerprint: record.fingerprint,
    status: record.status,
    createdAt: new Date(record.createdAt),
    approvalBy: record.approval?.approvedBy ?? null,
    approvalAt: record.approval ? new Date(record.approval.approvedAt) : null,
    rejectionBy: record.rejection?.rejectedBy ?? null,
    rejectionAt: record.rejection ? new Date(record.rejection.rejectedAt) : null,
    rejectionReason: record.rejection?.reason ?? null,
  };
}

export function toEvaluationRows(
  record: PurchaseRecord,
): (typeof evaluations.$inferInsert)[] {
  return record.evaluations.map((evaluation) => ({
    requestId: record.id,
    context: evaluation.context,
    decision: evaluation.decision.decision,
    reasonCode: evaluation.decision.reasonCode,
    reason: evaluation.decision.reason,
    ruleVersion: evaluation.decision.ruleVersion,
    evaluatedAt: new Date(evaluation.evaluatedAt),
  }));
}

export function toPurchaseRecord(
  row: PurchaseRow,
  evaluationRows: EvaluationRow[],
): PurchaseRecord {
  const evaluations: Evaluation[] = evaluationRows.map((evaluation) => ({
    context: assertOneOf(evaluation.context, EVALUATION_CONTEXTS, "evaluation context"),
    decision: {
      decision: assertOneOf(evaluation.decision, ["ALLOW", "ASK", "DENY"], "decision"),
      reasonCode: evaluation.reasonCode as Evaluation["decision"]["reasonCode"],
      reason: evaluation.reason,
      ruleVersion: evaluation.ruleVersion,
    },
    evaluatedAt: evaluation.evaluatedAt.toISOString(),
  }));

  const record: PurchaseRecord = {
    id: row.id,
    request: {
      id: row.id,
      agentId: row.agentId,
      payee: row.payee,
      purpose: row.purpose,
      category: row.category,
      amountMinor: row.amountMinor,
      currency: row.currency,
    },
    fingerprint: row.fingerprint,
    status: assertOneOf(row.status, REQUEST_STATUSES, "request status"),
    createdAt: row.createdAt.toISOString(),
    evaluations,
  };

  if (row.approvalBy && row.approvalAt) {
    record.approval = {
      approvedBy: row.approvalBy,
      approvedAt: row.approvalAt.toISOString(),
    };
  }
  if (row.rejectionBy && row.rejectionAt) {
    record.rejection = {
      rejectedBy: row.rejectionBy,
      rejectedAt: row.rejectionAt.toISOString(),
      ...(row.rejectionReason ? { reason: row.rejectionReason } : {}),
    };
  }

  return record;
}

export function toSpendingEvent(row: SpendingRow): SpendingEvent {
  return {
    id: row.id,
    requestId: row.requestId,
    kind: assertOneOf(row.kind, SPENDING_EVENT_KINDS, "spending event kind"),
    amountMinor: row.amountMinor,
    currency: row.currency,
    occurredAt: row.occurredAt.toISOString(),
    ...(row.providerRef ? { providerRef: row.providerRef } : {}),
    ...(row.note ? { note: row.note } : {}),
  };
}

export function toSpendingRow(
  event: SpendingEvent,
): typeof spendingEvents.$inferInsert {
  return {
    id: event.id,
    requestId: event.requestId,
    kind: event.kind as SpendingEventKind,
    amountMinor: event.amountMinor,
    currency: event.currency,
    occurredAt: new Date(event.occurredAt),
    providerRef: event.providerRef ?? null,
    note: event.note ?? null,
  };
}

/** Values to write for the single active rules row. */
export function toRulesRow(
  rules: SpendingRules,
  updatedAt: Date,
): typeof spendingRules.$inferInsert {
  return {
    id: ACTIVE_RULES_ID,
    ruleVersion: rules.ruleVersion,
    currency: rules.currency,
    perPurchaseAutoLimitMinor: rules.perPurchaseAutoLimitMinor,
    monthlyCapMinor: rules.monthlyCapMinor,
    permittedCategories: rules.permittedCategories,
    requireApprovalForNewPayee: rules.requireApprovalForNewPayee,
    updatedAt,
  };
}

/**
 * Rebuild rules from a row and re-validate them. Stored rules that no longer
 * parse fail loudly rather than feeding the engine something malformed.
 */
export function toSpendingRules(row: RulesRow): SpendingRules {
  const parsed = parseRules({
    ruleVersion: row.ruleVersion,
    currency: row.currency,
    perPurchaseAutoLimitMinor: row.perPurchaseAutoLimitMinor,
    monthlyCapMinor: row.monthlyCapMinor,
    permittedCategories: row.permittedCategories,
    requireApprovalForNewPayee: row.requireApprovalForNewPayee,
  });
  if (!parsed.ok) {
    throw new Error(`Stored spending rules are invalid: ${parsed.reason}`);
  }
  return parsed.value;
}
