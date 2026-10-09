/**
 * Saved payment method vocabulary (Phase 4).
 *
 * To let the agent pay without a human present on every purchase, the user
 * vaults a payment method with the provider ONCE (e.g. PayPal "store in vault").
 * The provider then returns an opaque token that the merchant side can charge
 * server-side. This is that record.
 *
 * Security: `providerTokenId` is a sensitive handle. It must stay server-side and
 * must never be logged, sent to the browser, or committed.
 */

export type SavedPaymentMethodStatus = "ACTIVE" | "REVOKED";

/**
 * The kind of provider payment source a vault token represents.
 *
 * The gateway must send the vault token in the matching `payment_source` object
 * (`paypal` vs `card`); PayPal rejects a token sent against the wrong source.
 */
export type PaymentSourceType = "paypal" | "card";

export interface SavedPaymentMethod {
  /** Our id. */
  id: string;
  /** The owning account. Single global owner for the MVP. */
  ownerId: string;
  /** Provider name, e.g. "paypal". */
  provider: string;
  /** Which provider payment source this token is for (wallet vs card). */
  sourceType: PaymentSourceType;
  /** The provider's vault / payment-token id (sensitive). */
  providerTokenId: string;
  /** The provider's customer id, when the provider supplies one. */
  providerCustomerId?: string;
  /** The payer's email, for audit only. */
  payerEmail?: string;
  status: SavedPaymentMethodStatus;
  createdAt: string;
  revokedAt?: string;
}

/**
 * The MVP has one global owner until the identity/auth decision is made. Using a
 * named constant keeps that placeholder explicit rather than scattered.
 */
export const DEFAULT_OWNER_ID = "default";
