/**
 * PayPal payment gateway (Phase 4).
 *
 * Implements the core `PaymentGateway` port. It is called ONLY by
 * `executeAuthorizedPurchase`, after the deterministic authorization gate, with
 * a frozen payment instruction. It never decides policy.
 *
 * Flow (merchant-initiated, using a vaulted payment source):
 *   1. Load the owner's active saved payment method (vault id + source type).
 *   2. Create a PayPal order for the exact authorized amount, charging the vault.
 *   3. Obtain the capture. Vaulted merchant-initiated orders are captured by
 *      PayPal during creation, so the adapter reads that capture (or captures
 *      explicitly and recovers from a rejected duplicate by re-reading the order).
 *   4. Report the capture's state:
 *        COMPLETED -> CAPTURED (the caller verifies the amount before counting),
 *        PENDING   -> PENDING   (initiated but unsettled; never counted yet),
 *        otherwise -> FAILED.
 *
 * `checkCapture` re-reads a capture by id for reconciliation. It is read-only.
 *
 * The vault id is a secret handle: it is never logged or returned to the caller.
 */

import {
  type CapturedPayment,
  type Order,
  type OrderRequest,
  type OrdersCapture,
  CaptureStatus,
  CheckoutPaymentIntent,
  OrderStatus,
  PaymentInitiator,
  StoredPaymentSourcePaymentType,
  StoredPaymentSourceUsageType,
} from "@paypal/paypal-server-sdk";

import type {
  PaymentGateway,
  PaymentInstruction,
  PaymentOutcome,
} from "../../core/execution";
import type {
  PaymentMethodStore,
  PaymentSourceType,
} from "../../core/payments";
import { DEFAULT_OWNER_ID } from "../../core/payments";
import { fromPayPalAmount, toPayPalAmount } from "./money";
import { describePayPalError } from "./errors";
import type { PayPalOrdersPort, PayPalPaymentsPort } from "./ports";

export interface PayPalPaymentGatewayDeps {
  orders: PayPalOrdersPort;
  payments: PayPalPaymentsPort;
  paymentMethods: PaymentMethodStore;
  ownerId?: string;
}

/**
 * Build the create-order body for an authorized payment, charging the vault
 * through the payment source that matches the token's type. Exported for tests.
 */
export function buildCreateOrderBody(
  instruction: PaymentInstruction,
  vaultId: string,
  sourceType: PaymentSourceType = "paypal",
): OrderRequest {
  const value = toPayPalAmount(instruction.amountMinor, instruction.currency);
  // Our domain's `payee` is free text. PayPal only accepts a payee EMAIL address;
  // otherwise we let the order default to the app's own merchant account.
  const payee = instruction.payee.includes("@")
    ? { emailAddress: instruction.payee }
    : undefined;

  const paymentSource: OrderRequest["paymentSource"] =
    sourceType === "card"
      ? {
          card: {
            vaultId,
            storedCredential: {
              paymentInitiator: PaymentInitiator.Merchant,
              paymentType: StoredPaymentSourcePaymentType.Unscheduled,
              usage: StoredPaymentSourceUsageType.Subsequent,
            },
          },
        }
      : {
          paypal: {
            vaultId,
            storedCredential: {
              paymentInitiator: PaymentInitiator.Merchant,
              usage: StoredPaymentSourceUsageType.Subsequent,
            },
          },
        };

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
    paymentSource,
  };
}

interface CaptureFacts {
  captureId: string;
  value: string;
  currency: string;
  createdAt: string;
  status: CaptureStatus;
  statusReason?: string;
}

/** Read the fields we care about from an order capture or a capture read. */
function toCaptureFacts(
  capture: OrdersCapture | CapturedPayment,
): CaptureFacts | null {
  if (!capture.id || !capture.amount) {
    return null;
  }
  return {
    captureId: capture.id,
    value: String(capture.amount.value),
    currency: String(capture.amount.currencyCode),
    createdAt: capture.createTime ?? new Date().toISOString(),
    status: capture.status ?? CaptureStatus.Failed,
    ...(capture.statusDetails?.reason
      ? { statusReason: String(capture.statusDetails.reason) }
      : {}),
  };
}

/**
 * Extract a capture from an order, preferring a completed one, then any other
 * capture (e.g. PENDING), so the caller can classify its state. Returns `null`
 * only when the order carries no capture at all.
 */
function readCapture(order: Order | undefined): CaptureFacts | null {
  const captures = order?.purchaseUnits?.[0]?.payments?.captures ?? [];
  let fallback: CaptureFacts | null = null;
  for (const capture of captures) {
    const facts = toCaptureFacts(capture);
    if (!facts) continue;
    if (facts.status === CaptureStatus.Completed) return facts;
    if (!fallback) fallback = facts;
  }
  return fallback;
}

/** A safe, bounded description of a provider error. Never includes credentials. */
function describeProviderError(error: unknown): string {
  return `PayPal request failed: ${describePayPalError(error)}`;
}

export class PayPalPaymentGateway implements PaymentGateway {
  private readonly orders: PayPalOrdersPort;
  private readonly payments: PayPalPaymentsPort;
  private readonly paymentMethods: PaymentMethodStore;
  private readonly ownerId: string;

  constructor(deps: PayPalPaymentGatewayDeps) {
    this.orders = deps.orders;
    this.payments = deps.payments;
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
      body = buildCreateOrderBody(instruction, method.providerTokenId, method.sourceType);
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

    if (!order.id) {
      return { status: "FAILED", reason: "PayPal did not return an order id." };
    }

    // Vaulted, merchant-initiated orders are captured by PayPal during creation.
    // If the create response already carries a capture (completed OR pending),
    // use it and never re-capture.
    let facts = readCapture(order);

    // If PayPal completed the order but omitted the capture from the create
    // response, fetch the full order so we can read it (never re-capture).
    if (!facts && order.status === OrderStatus.Completed) {
      facts = await this.fetchCaptureOrNull(order.id);
    }

    if (!facts) {
      let captured: Order | null = null;
      try {
        captured = await this.orders.captureOrder({
          id: order.id,
          paypalRequestId: `capture:${instruction.requestId}`,
          prefer: "return=representation",
        });
      } catch (error) {
        // PayPal rejects a second capture with 422 "Order already captured".
        // Confirm against the provider and adopt the existing capture instead of
        // reporting a false failure.
        const confirmed = await this.fetchCaptureOrNull(order.id);
        if (!confirmed) {
          return { status: "FAILED", reason: describeProviderError(error) };
        }
        facts = confirmed;
      }
      if (!facts && captured) {
        facts = readCapture(captured);
      }
    }

    if (!facts) {
      return {
        status: "FAILED",
        reason: "PayPal did not report a capture.",
      };
    }

    return this.toOutcome(facts, order.id);
  }

  async checkCapture(providerCaptureId: string): Promise<PaymentOutcome> {
    let capture: CapturedPayment;
    try {
      capture = await this.payments.getCapture({ captureId: providerCaptureId });
    } catch (error) {
      return { status: "FAILED", reason: describeProviderError(error) };
    }
    const facts = toCaptureFacts(capture);
    if (!facts) {
      return { status: "FAILED", reason: "PayPal returned no capture details." };
    }
    return this.toOutcome(facts);
  }

  /** Classify a provider capture into the core's `PaymentOutcome`. */
  private toOutcome(facts: CaptureFacts, providerOrderId?: string): PaymentOutcome {
    let amountMinor: number;
    try {
      amountMinor = fromPayPalAmount(facts.value, facts.currency);
    } catch (error) {
      return { status: "FAILED", reason: describeProviderError(error) };
    }

    if (facts.status === CaptureStatus.Completed) {
      return {
        status: "CAPTURED",
        providerCaptureId: facts.captureId,
        ...(providerOrderId ? { providerOrderId } : {}),
        amountMinor,
        currency: facts.currency,
        capturedAt: facts.createdAt,
      };
    }

    if (facts.status === CaptureStatus.Pending) {
      return {
        status: "PENDING",
        providerCaptureId: facts.captureId,
        ...(providerOrderId ? { providerOrderId } : {}),
        amountMinor,
        currency: facts.currency,
        createdAt: facts.createdAt,
        reason: facts.statusReason ?? "PENDING",
      };
    }

    const detail = facts.statusReason ? ` (${facts.statusReason})` : "";
    return {
      status: "FAILED",
      reason: `PayPal capture status is ${facts.status}${detail}.`,
    };
  }

  /**
   * Read an order from the provider and return its capture, if any. Used to
   * recover when PayPal captures during creation, or to confirm state after a
   * capture error. Never throws: a read failure yields `null`.
   */
  private async fetchCaptureOrNull(orderId: string): Promise<CaptureFacts | null> {
    try {
      const order = await this.orders.getOrder({ id: orderId });
      return readCapture(order);
    } catch {
      return null;
    }
  }
}
