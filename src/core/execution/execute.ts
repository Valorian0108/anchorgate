/**
 * Authorized-purchase execution (Phase 4).
 *
 * This is the ONLY path from an authorized request to a real payment. It is the
 * "do not ask the AI about its own request" rule made operational:
 *
 *   1. Re-run the deterministic authorization gate (hard constraints cannot be
 *      overridden by a prior approval).
 *   2. Submit to the provider through the `PaymentGateway` port.
 *   3. Verify the provider's receipt against the authorized amount/currency.
 *   4. Record a verified capture in the spending ledger (idempotent by provider
 *      capture id), so spending is counted exactly once.
 *
 * The provider is never asked whether the purchase *should* happen; that was
 * decided by the engine in step 1.
 */

import {
  revalidateBeforeExecution,
  type PurchaseRecord,
} from "../purchases";
import { captureEventId, type SpendingLedger } from "../spending";
import type { PaymentGateway } from "./types";

/** A verified capture, as recorded by the ledger. */
export interface ExecutionCapture {
  providerCaptureId: string;
  amountMinor: number;
  currency: string;
  capturedAt: string;
}

/** A capture the provider initiated but has not settled yet. Not counted. */
export interface PendingCapture {
  providerCaptureId: string;
  providerOrderId?: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  reason: string;
}

/**
 * The result of an execution attempt.
 *
 * - `CAPTURED` the payment was captured, verified, and counted.
 * - `PENDING`  the provider initiated the capture but has not settled it; NOT
 *              counted (see `reconcilePendingPurchase`).
 * - `BLOCKED`  the pre-execution gate refused it (hard constraint or new
 *              approval requirement); the provider was never called.
 * - `FAILED`   the provider declined/errored; nothing was counted.
 * - `MISMATCH` the provider's receipt did not match what was authorized; nothing
 *              was counted (fail safe).
 */
export type ExecutionStatus =
  | "CAPTURED"
  | "PENDING"
  | "BLOCKED"
  | "FAILED"
  | "MISMATCH";

export interface ExecutionOutcome {
  status: ExecutionStatus;
  /** The record after execution (status `EXECUTED` only when captured). */
  record: PurchaseRecord;
  reason: string;
  capture?: ExecutionCapture;
  /** Present when `status` is `PENDING`; the unsettled capture to reconcile. */
  pending?: PendingCapture;
}

export interface ExecuteAuthorizedPurchaseArgs {
  record: PurchaseRecord;
  /** Current rules and budget, re-checked immediately before payment. */
  rules: unknown;
  state: unknown;
  now: Date;
  gateway: PaymentGateway;
  ledger: SpendingLedger;
}

export async function executeAuthorizedPurchase(
  args: ExecuteAuthorizedPurchaseArgs,
): Promise<ExecutionOutcome> {
  const { record, rules, state, now, gateway, ledger } = args;

  // 1. Final deterministic gate. If a hard constraint now fails, or the request
  //    now needs approval, we stop before touching the provider.
  const gate = revalidateBeforeExecution(record, rules, state, now);
  if (!gate.ok) {
    return { status: "BLOCKED", record: gate.record, reason: gate.reason };
  }

  const request = gate.record.request;

  // 2. Audit the attempt (does not affect any total).
  await ledger.record({
    id: `submitted:${request.id}`,
    requestId: request.id,
    kind: "SUBMITTED",
    amountMinor: request.amountMinor,
    currency: request.currency,
    occurredAt: now.toISOString(),
    note: "Submitted to the payment provider after authorization.",
  });

  // 3. Pay. The instruction is built ONLY from the frozen authorized request, so
  //    the amount cannot change between authorization and execution.
  const outcome = await gateway.pay({
    requestId: request.id,
    payee: request.payee,
    amountMinor: request.amountMinor,
    currency: request.currency,
    purpose: request.purpose,
  });

  if (outcome.status === "FAILED") {
    await ledger.record({
      id: `capture-failed:${request.id}`,
      requestId: request.id,
      kind: "CAPTURE_FAILED",
      amountMinor: request.amountMinor,
      currency: request.currency,
      occurredAt: now.toISOString(),
      note: outcome.reason,
    });
    return { status: "FAILED", record: gate.record, reason: outcome.reason };
  }

  // 4. Verify the provider's receipt against what we authorized. A capture that
  //    does not match is never counted.
  if (
    outcome.amountMinor !== request.amountMinor ||
    outcome.currency !== request.currency
  ) {
    return {
      status: "MISMATCH",
      record: gate.record,
      reason:
        `Provider capture did not match the authorized amount/currency ` +
        `(authorized ${request.amountMinor} ${request.currency}; ` +
        `captured ${outcome.amountMinor} ${outcome.currency}).`,
    };
  }

  // 4b. The provider initiated the capture but has not settled it. Record it for
  //     audit and reconciliation, but NEVER count it: a pending capture can still
  //     fail, and no money has completed yet.
  if (outcome.status === "PENDING") {
    await ledger.record({
      id: `capture-pending:${outcome.providerCaptureId}`,
      requestId: request.id,
      kind: "CAPTURE_PENDING",
      amountMinor: outcome.amountMinor,
      currency: outcome.currency,
      occurredAt: outcome.createdAt,
      providerRef: outcome.providerCaptureId,
      note: outcome.reason,
    });
    return {
      status: "PENDING",
      record: { ...gate.record, status: "PENDING_SETTLEMENT" },
      reason:
        `Payment initiated but not yet settled (${outcome.reason}). ` +
        `Nothing is counted until the provider settles it.`,
      pending: {
        providerCaptureId: outcome.providerCaptureId,
        ...(outcome.providerOrderId
          ? { providerOrderId: outcome.providerOrderId }
          : {}),
        amountMinor: outcome.amountMinor,
        currency: outcome.currency,
        createdAt: outcome.createdAt,
        reason: outcome.reason,
      },
    };
  }

  // 5. Record the verified capture (idempotent by provider capture id).
  await ledger.record({
    id: captureEventId(outcome.providerCaptureId),
    requestId: request.id,
    kind: "CAPTURE_VERIFIED",
    amountMinor: outcome.amountMinor,
    currency: outcome.currency,
    occurredAt: outcome.capturedAt,
    providerRef: outcome.providerCaptureId,
  });

  return {
    status: "CAPTURED",
    record: { ...gate.record, status: "EXECUTED" },
    reason: "Payment captured and verified.",
    capture: {
      providerCaptureId: outcome.providerCaptureId,
      amountMinor: outcome.amountMinor,
      currency: outcome.currency,
      capturedAt: outcome.capturedAt,
    },
  };
}

export interface ReconcilePendingPurchaseArgs {
  /** The record whose payment is awaiting settlement (`PENDING_SETTLEMENT`). */
  record: PurchaseRecord;
  gateway: PaymentGateway;
  ledger: SpendingLedger;
  now: Date;
}

/**
 * Reconcile a purchase whose provider capture was left `PENDING`.
 *
 * This NEVER creates a payment. It only asks the provider for the capture's
 * current state:
 *   - settled  -> verify amount/currency, count it exactly once (idempotent),
 *                 and mark the record `EXECUTED`.
 *   - still open -> report `PENDING`; nothing counted.
 *   - declined/reversed -> report `FAILED`; nothing counted.
 *
 * The capture id comes from the `CAPTURE_PENDING` audit event recorded at
 * execution time, so reconciliation is bound to the exact provider capture.
 */
export async function reconcilePendingPurchase(
  args: ReconcilePendingPurchaseArgs,
): Promise<ExecutionOutcome> {
  const { record, gateway, ledger, now } = args;
  const request = record.request;

  const events = await ledger.eventsForRequest(record.id);
  const pendingEvent = [...events]
    .reverse()
    .find((event) => event.kind === "CAPTURE_PENDING");
  const providerCaptureId = pendingEvent?.providerRef;
  if (!providerCaptureId) {
    return {
      status: "FAILED",
      record,
      reason: "No pending capture is recorded for this request; nothing to reconcile.",
    };
  }

  const outcome = await gateway.checkCapture(providerCaptureId);

  if (outcome.status === "FAILED") {
    await ledger.record({
      id: `capture-failed:${record.id}`,
      requestId: request.id,
      kind: "CAPTURE_FAILED",
      amountMinor: request.amountMinor,
      currency: request.currency,
      occurredAt: now.toISOString(),
      note: outcome.reason,
    });
    return { status: "FAILED", record, reason: outcome.reason };
  }

  if (outcome.status === "PENDING") {
    return {
      status: "PENDING",
      record,
      reason: `Payment is still awaiting settlement (${outcome.reason}).`,
      pending: {
        providerCaptureId: outcome.providerCaptureId,
        ...(outcome.providerOrderId
          ? { providerOrderId: outcome.providerOrderId }
          : {}),
        amountMinor: outcome.amountMinor,
        currency: outcome.currency,
        createdAt: outcome.createdAt,
        reason: outcome.reason,
      },
    };
  }

  if (
    outcome.amountMinor !== request.amountMinor ||
    outcome.currency !== request.currency
  ) {
    return {
      status: "MISMATCH",
      record,
      reason:
        `Settled capture did not match the authorized amount/currency ` +
        `(authorized ${request.amountMinor} ${request.currency}; ` +
        `settled ${outcome.amountMinor} ${outcome.currency}).`,
    };
  }

  // Idempotent by provider capture id, so calling this more than once counts once.
  await ledger.record({
    id: captureEventId(outcome.providerCaptureId),
    requestId: request.id,
    kind: "CAPTURE_VERIFIED",
    amountMinor: outcome.amountMinor,
    currency: outcome.currency,
    occurredAt: outcome.capturedAt,
    providerRef: outcome.providerCaptureId,
  });

  return {
    status: "CAPTURED",
    record: { ...record, status: "EXECUTED" },
    reason: "Pending payment settled and verified.",
    capture: {
      providerCaptureId: outcome.providerCaptureId,
      amountMinor: outcome.amountMinor,
      currency: outcome.currency,
      capturedAt: outcome.capturedAt,
    },
  };
}
