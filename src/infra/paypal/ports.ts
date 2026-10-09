/**
 * Narrow ports over the PayPal SDK (Phase 4).
 *
 * The gateway and enrollment code depend on these small interfaces, not on the
 * concrete SDK controllers. That keeps the SDK at the edge, makes the adapter
 * unit-testable with fakes, and means a future SDK change touches one file.
 */

import type {
  CapturedPayment,
  Order,
  OrderRequest,
  PaymentTokenRequest,
  PaymentTokenResponse,
  SetupTokenRequest,
  SetupTokenResponse,
} from "@paypal/paypal-server-sdk";

export interface PayPalOrdersPort {
  createOrder(input: {
    body: OrderRequest;
    /** PayPal idempotency key (mandatory for single-step create with a source). */
    paypalRequestId: string;
    prefer?: string;
  }): Promise<Order>;
  captureOrder(input: {
    id: string;
    paypalRequestId: string;
    prefer?: string;
  }): Promise<Order>;
  /** Read an order (used to confirm capture state; never mutates). */
  getOrder(input: { id: string }): Promise<Order>;
}

export interface PayPalVaultPort {
  createSetupToken(input: {
    body: SetupTokenRequest;
    paypalRequestId?: string;
  }): Promise<SetupTokenResponse>;
  getSetupToken(id: string): Promise<SetupTokenResponse>;
  createPaymentToken(input: {
    body: PaymentTokenRequest;
    paypalRequestId?: string;
  }): Promise<PaymentTokenResponse>;
}

export interface PayPalPaymentsPort {
  /**
   * Read a capture by its provider id. READ-ONLY. Used to reconcile a capture
   * the provider previously reported as `PENDING`.
   */
  getCapture(input: { captureId: string }): Promise<CapturedPayment>;
}
