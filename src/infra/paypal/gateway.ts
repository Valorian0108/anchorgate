/**
 * PayPal payment gateway (Phase 4).
 *
 * Implements the core `PaymentGateway` port. It is called ONLY by
 * `executeAuthorizedPurchase`, after the deterministic authorization gate, with
 * a frozen payment instruction. It never decides policy.
 *
 * Flow (merchant-initiated, using a vaulted payment source):
 *   1. Load the owner's active saved payment method (vault id).
 *   2. Create a PayPal order for the exact authorized amount, charging the vault.
 *   3. Capture it.
 *   4. Return the provider's receipt; the caller verifies it before counting.
 *
 * The vault id is a secret handle: it is never logged or returned to the caller.
 */

import {
  type Order,
  type OrderRequest,
  CaptureStatus,
  CheckoutPaymentIntent,
  PaymentInitiator,
  StoredPaymentSourceUsageType,
} from "@paypal/paypal-server-sdk";

import type {
  PaymentGateway,
  PaymentInstruction,
  PaymentOutcome,
} from "../../core/execution";
import type { PaymentMethodStore } from "../../core/payments";
import { DEFAULT_OWNER_ID } from "../../core/payments";
import { fromPayPalAmount, toPayPalAmount } from "./money";
import { describePayPalError } from "./errors";
import type { PayPalOrdersPort } from "./ports";

export interface PayPalPaymentGatewayDeps {
  orders: PayPalOrdersPort;
  paymentMethods: PaymentMethodStore;
  ownerId?: string;
}

/** Build the create-order body for an authorized payment. Exported for tests. */
export function buildCreateOrderBody(
  instruction: PaymentInstruction,
  vaultId: string,
): OrderRequest {
  const value = toPayPalAmount(instruction.amountMinor, instruction.currency);
  // Our domain's `payee` is free text. PayPal only accepts a payee EMAIL address;
  // otherwise we let the order default to the app's own merchant account.
  const payee = instruction.payee.includes("@")
    ? { emailAddress: instruction.payee }
    : undefined;
  return {
    intent: CheckoutPaymentIntent.Capture,
    purchaseUnits: [
      {
        amount: { currencyCode: instruction.currency, value },
        description: instruction.purpose.slice(0, 127),
        customId: instruction.requestId,
        payee,
      },
    ],
    paymentSource: {
      paypal: {
        vaultId,
        storedCredential: {
          paymentInitiator: PaymentInitiator.Merchant,
          usage: StoredPaymentSourceUsageType.Subsequent,
        },
      },
    },
  };
}

interface CaptureFacts {
  captureId: string;
  value: string;
  currency: string;
  capturedAt: string;
}

/** Extract the first completed capture from an order, if any. */
function readCompletedCapture(order: Order | undefined): CaptureFacts | null {
  const captures = order?.purchaseUnits?.[0]?.payments?.captures ?? [];
  for (const capture of captures) {
    if (capture.status === CaptureStatus.Completed && capture.id && capture.amount) {
      return {
        captureId: capture.id,
        value: String(capture.amount.value),
        currency: String(capture.amount.currencyCode),
        capturedAt: capture.createTime ?? new Date().toISOString(),
      };
    }
  }
  return null;
}

/** A safe, bounded description of a provider error. Never includes credentials. */
function describeProviderError(error: unknown): string {
  return `PayPal request failed: ${describePayPalError(error)}`;
}

export class PayPalPaymentGateway implements PaymentGateway {
  private readonly orders: PayPalOrdersPort;
  private readonly paymentMethods: PaymentMethodStore;
  private readonly ownerId: string;

  constructor(deps: PayPalPaymentGatewayDeps) {
    this.orders = deps.orders;
    this.paymentMethods = deps.paymentMethods;
    this.ownerId = deps.ownerId ?? DEFAULT_OWNER_ID;
  }

  async pay(instruction: PaymentInstruction): Promise<PaymentOutcome> {
    const method = await this.paymentMethods.getActive(this.ownerId);
    if (!method) {
      return {
        status: "FAILED",
        reason: "No saved payment method is enrolled; cannot pay.",
      };
    }

    let body: OrderRequest;
    try {
      body = buildCreateOrderBody(instruction, method.providerTokenId);
    } catch (error) {
      return { status: "FAILED", reason: describeProviderError(error) };
    }

    let order: Order;
    try {
      order = await this.orders.createOrder({
        body,
        paypalRequestId: `create:${instruction.requestId}`,
        prefer: "return=representation",
      });
    } catch (error) {
      return { status: "FAILED", reason: describeProviderError(error) };
    }

    // Some flows auto-complete on create; if so, use that capture.
    let direct = readCompletedCapture(order);
    if (!order.id) {
      return { status: "FAILED", reason: "PayPal did not return an order id." };
    }
    if (!direct) {
      let captured: Order;
      try {
        captured = await this.orders.captureOrder({
          id: order.id,
          paypalRequestId: `capture:${instruction.requestId}`,
          prefer: "return=representation",
        });
      } catch (error) {
        return { status: "FAILED", reason: describeProviderError(error) };
      }
      direct = readCompletedCapture(captured);
    }

    if (!direct) {
      return {
        status: "FAILED",
        reason: "PayPal did not report a completed capture.",
      };
    }

    let amountMinor: number;
    try {
      amountMinor = fromPayPalAmount(direct.value, direct.currency);
    } catch (error) {
      return { status: "FAILED", reason: describeProviderError(error) };
    }

    return {
      status: "CAPTURED",
      providerCaptureId: direct.captureId,
      providerOrderId: order.id,
      amountMinor,
      currency: direct.currency,
      capturedAt: direct.capturedAt,
    };
  }
}
