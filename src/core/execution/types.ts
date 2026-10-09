/**
 * Payment execution vocabulary (Phase 4).
 *
 * This is the boundary between our deterministic authorization layer and the
 * payment provider (PayPal). The core defines a `PaymentGateway` PORT; the
 * infrastructure provides the PayPal adapter that implements it.
 *
 * Hard rule: the gateway is only ever called by `executeAuthorizedPurchase`,
 * AFTER the final authorization gate has passed. The provider is never asked to
 * decide anything about policy — it just moves money for an already-authorized,
 * immutable request.
 */

/** The exact, already-authorized payment to make. Derived only from the frozen request. */
export interface PaymentInstruction {
  requestId: string;
  /** The merchant/payee to pay (for PayPal, the payee identifier/email). */
  payee: string;
  /** Amount in integer minor units, matching the authorized request. */
  amountMinor: number;
  /** ISO 4217 currency code, matching the authorized request. */
  currency: string;
  /** Human-readable purpose, for the provider's order description/memo. */
  purpose: string;
}

/**
 * The provider's answer.
 *
 * `CAPTURED` means the provider reports the money as actually captured. It is
 * NOT yet trusted: the caller must verify the amount/currency against what was
 * authorized before counting it.
 *
 * `PENDING` means the provider accepted and initiated the capture, but has not
 * yet settled it (for example, a PayPal wallet-over-vault capture held as
 * `PENDING_REVIEW`). The money is NOT counted until it settles; the caller must
 * reconcile later. A pending capture can still fail, so it must never be counted
 * early.
 */
export type PaymentOutcome =
  | {
      status: "CAPTURED";
      /** Provider capture id (idempotency key for our ledger). */
      providerCaptureId: string;
      /** Provider order id, when available (audit/refunds). */
      providerOrderId?: string;
      amountMinor: number;
      currency: string;
      /** When the provider captured the payment, ISO 8601. */
      capturedAt: string;
    }
  | {
      status: "PENDING";
      /** Provider capture id (used to reconcile later). */
      providerCaptureId: string;
      /** Provider order id, when available (audit/refunds). */
      providerOrderId?: string;
      amountMinor: number;
      currency: string;
      /** When the provider created the pending capture, ISO 8601. */
      createdAt: string;
      /** Why the provider is holding it, e.g. "PENDING_REVIEW". */
      reason: string;
    }
  | {
      status: "FAILED";
      reason: string;
    };

/**
 * The port the payment provider must satisfy.
 *
 * Implementations must be idempotent on their side where the provider supports
 * it, and must never be reachable directly from the AI agent: only our
 * authorizer-gated executor calls this.
 */
export interface PaymentGateway {
  pay(instruction: PaymentInstruction): Promise<PaymentOutcome>;
  /**
   * Re-check a capture the provider previously reported as `PENDING`. This is
   * READ-ONLY: it never creates or changes a payment, it only asks the provider
   * for the capture's current state. Returns `CAPTURED` once it settles,
   * `PENDING` while it is still open, or `FAILED` if it was declined/reversed.
   */
  checkCapture(providerCaptureId: string): Promise<PaymentOutcome>;
}
