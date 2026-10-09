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

/**
 * The result of an execution attempt.
 *
 * - `CAPTURED` the payment was captured, verified, and counted.
 * - `BLOCKED`  the pre-execution gate refused it (hard constraint or new
 *              approval requirement); the provider was never called.
 * - `FAILED`   the provider declined/errored; nothing was counted.
 * - `MISMATCH` the provider's receipt did not match what was authorized; nothing
 *              was counted (fail safe).
 */
export type ExecutionStatus = "CAPTURED" | "BLOCKED" | "FAILED" | "MISMATCH";

export interface ExecutionOutcome {
  status: ExecutionStatus;
  /** The record after execution (status `EXECUTED` only when captured). */
  record: PurchaseRecord;
  reason: string;
  capture?: ExecutionCapture;
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
