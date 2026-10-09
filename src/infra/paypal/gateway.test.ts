/**
 * Tests for the PayPal payment gateway.
 *
 * These run against a FAKE PayPal port, so they prove our logic (exact amount,
 * vault usage, receipt extraction, fail-safe behavior) without a network. Per
 * the engineering standard, real Sandbox verification is tracked separately.
 */

import {
  CaptureIncompleteReason,
  CaptureStatus,
  CheckoutPaymentIntent,
  OrderStatus,
  PaymentInitiator,
  StoredPaymentSourceUsageType,
  type CapturedPayment,
  type Order,
  type OrderRequest,
} from "@paypal/paypal-server-sdk";
import { describe, expect, it } from "vitest";

import type { PaymentInstruction } from "../../core/execution";
import { InMemoryPaymentMethodStore } from "../../core/payments";
import { buildCreateOrderBody, PayPalPaymentGateway } from "./gateway";
import type { PayPalOrdersPort, PayPalPaymentsPort } from "./ports";

const INSTRUCTION: PaymentInstruction = {
  requestId: "req-1",
  payee: "merchant@example.com",
  amountMinor: 500,
  currency: "USD",
  purpose: "Office supplies",
};

async function storeWithVault() {
  const store = new InMemoryPaymentMethodStore();
  await store.save({
    id: "pm-1",
    ownerId: "default",
    provider: "paypal",
    sourceType: "paypal",
    providerTokenId: "VAULT-123",
    status: "ACTIVE",
    createdAt: "2026-10-01T00:00:00.000Z",
  });
  return store;
}

function orderWithCapture(overrides: {
  id?: string;
  status?: OrderStatus;
  captureId?: string;
  captureStatus?: CaptureStatus;
  currencyCode?: string;
  value?: string;
  createTime?: string;
} = {}): Order {
  return {
    id: overrides.id ?? "ORDER-1",
    status: overrides.status ?? OrderStatus.Completed,
    purchaseUnits: [
      {
        payments: {
          captures: [
            {
              id: overrides.captureId ?? "CAP-1",
              status: overrides.captureStatus ?? CaptureStatus.Completed,
              amount: {
                currencyCode: overrides.currencyCode ?? "USD",
                value: overrides.value ?? "5.00",
              },
              createTime: overrides.createTime ?? "2026-10-09T12:00:05.000Z",
            },
          ],
        },
      },
    ],
  };
}

class FakeOrdersPort implements PayPalOrdersPort {
  readonly createCalls: { body: OrderRequest; paypalRequestId: string }[] = [];
  readonly captureCalls: { id: string; paypalRequestId: string }[] = [];
  readonly getCalls: { id: string }[] = [];
  constructor(
    private readonly createResult: Order | Error,
    private readonly captureResult: Order | Error,
    private readonly getResult: Order | Error = new Error("getOrder not expected"),
  ) {}
  async createOrder(input: {
    body: OrderRequest;
    paypalRequestId: string;
    prefer?: string;
  }): Promise<Order> {
    this.createCalls.push({ body: input.body, paypalRequestId: input.paypalRequestId });
    if (this.createResult instanceof Error) throw this.createResult;
    return this.createResult;
  }
  async captureOrder(input: {
    id: string;
    paypalRequestId: string;
    prefer?: string;
  }): Promise<Order> {
    this.captureCalls.push({ id: input.id, paypalRequestId: input.paypalRequestId });
    if (this.captureResult instanceof Error) throw this.captureResult;
    return this.captureResult;
  }
  async getOrder(input: { id: string }): Promise<Order> {
    this.getCalls.push({ id: input.id });
    if (this.getResult instanceof Error) throw this.getResult;
    return this.getResult;
  }
}

class FakePaymentsPort implements PayPalPaymentsPort {
  readonly getCalls: { captureId: string }[] = [];
  constructor(
    private readonly result: CapturedPayment | Error = new Error("getCapture not expected"),
  ) {}
  async getCapture(input: { captureId: string }): Promise<CapturedPayment> {
    this.getCalls.push({ captureId: input.captureId });
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

/** A capture read as returned by the payments API. */
function capturedPayment(overrides: {
  id?: string;
  status?: CaptureStatus;
  currencyCode?: string;
  value?: string;
  createTime?: string;
  reason?: CaptureIncompleteReason;
} = {}): CapturedPayment {
  return {
    id: overrides.id ?? "CAP-1",
    status: overrides.status ?? CaptureStatus.Completed,
    amount: {
      currencyCode: overrides.currencyCode ?? "USD",
      value: overrides.value ?? "5.00",
    },
    createTime: overrides.createTime ?? "2026-10-09T12:00:05.000Z",
    ...(overrides.reason ? { statusDetails: { reason: overrides.reason } } : {}),
  };
}

function makeGateway(
  orders: FakeOrdersPort,
  paymentMethods: InMemoryPaymentMethodStore,
  payments: FakePaymentsPort = new FakePaymentsPort(),
): PayPalPaymentGateway {
  return new PayPalPaymentGateway({ orders, payments, paymentMethods });
}

describe("buildCreateOrderBody", () => {
  it("charges the exact amount against the vault with a merchant-initiated stored credential", () => {
    const body = buildCreateOrderBody(INSTRUCTION, "VAULT-123");
    expect(body.intent).toBe(CheckoutPaymentIntent.Capture);
    expect(body.purchaseUnits[0]?.amount).toEqual({
      currencyCode: "USD",
      value: "5.00",
    });
    expect(body.purchaseUnits[0]?.customId).toBe("req-1");
    expect(body.paymentSource?.paypal?.vaultId).toBe("VAULT-123");
    expect(body.paymentSource?.paypal?.storedCredential?.paymentInitiator).toBe(
      PaymentInitiator.Merchant,
    );
    expect(body.paymentSource?.paypal?.storedCredential?.usage).toBe(
      StoredPaymentSourceUsageType.Subsequent,
    );
  });

  it("charges a card vault through the card payment source", () => {
    const body = buildCreateOrderBody(INSTRUCTION, "CARD-VAULT-9", "card");
    expect(body.paymentSource?.card?.vaultId).toBe("CARD-VAULT-9");
    expect(body.paymentSource?.card?.storedCredential?.paymentInitiator).toBe(
      PaymentInitiator.Merchant,
    );
    // Card stored credentials require an explicit payment_type.
    expect(body.paymentSource?.card?.storedCredential?.paymentType).toBe(
      "UNSCHEDULED",
    );
    expect(body.paymentSource?.paypal).toBeUndefined();
  });

  it("only sets a payee when the payee looks like an email", () => {
    expect(
      buildCreateOrderBody(INSTRUCTION, "V").purchaseUnits[0]?.payee,
    ).toEqual({ emailAddress: "merchant@example.com" });
    expect(
      buildCreateOrderBody({ ...INSTRUCTION, payee: "Acme Supplies" }, "V")
        .purchaseUnits[0]?.payee,
    ).toBeUndefined();
  });
});

describe("PayPalPaymentGateway", () => {
  it("creates then captures, returning the verified provider receipt", async () => {
    const orders = new FakeOrdersPort(
      { id: "ORDER-1", status: OrderStatus.Created },
      orderWithCapture(),
    );
    const gateway = makeGateway(orders, await storeWithVault());

    const outcome = await gateway.pay(INSTRUCTION);

    expect(outcome).toEqual({
      status: "CAPTURED",
      providerCaptureId: "CAP-1",
      providerOrderId: "ORDER-1",
      amountMinor: 500,
      currency: "USD",
      capturedAt: "2026-10-09T12:00:05.000Z",
    });
    expect(orders.createCalls).toHaveLength(1);
    expect(orders.createCalls[0]?.paypalRequestId).toBe("create:req-1");
    expect(orders.captureCalls).toHaveLength(1);
    expect(orders.captureCalls[0]).toMatchObject({
      id: "ORDER-1",
      paypalRequestId: "capture:req-1",
    });
  });

  it("charges a card vault through the card payment source", async () => {
    const paymentMethods = new InMemoryPaymentMethodStore();
    await paymentMethods.save({
      id: "pm-card",
      ownerId: "default",
      provider: "paypal",
      sourceType: "card",
      providerTokenId: "CARD-VAULT",
      status: "ACTIVE",
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    const orders = new FakeOrdersPort(
      { id: "ORDER-1", status: OrderStatus.Created },
      orderWithCapture(),
    );
    const gateway = makeGateway(orders, paymentMethods);
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome.status).toBe("CAPTURED");
    expect(orders.createCalls[0]?.body.paymentSource?.card?.vaultId).toBe("CARD-VAULT");
    expect(orders.createCalls[0]?.body.paymentSource?.paypal).toBeUndefined();
  });

  it("does not capture when create already completed", async () => {
    const orders = new FakeOrdersPort(orderWithCapture(), new Error("should not capture"));
    const gateway = makeGateway(orders, await storeWithVault());
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome.status).toBe("CAPTURED");
    expect(orders.captureCalls).toHaveLength(0);
  });

  it("reads the capture from the order when creation auto-completes without one", async () => {
    // Vaulted merchant-initiated orders can capture during creation, and the
    // create response may omit the capture. Read it instead of re-capturing.
    const orders = new FakeOrdersPort(
      { id: "ORDER-1", status: OrderStatus.Completed },
      new Error("should not capture"),
      orderWithCapture(),
    );
    const gateway = makeGateway(orders, await storeWithVault());
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome).toMatchObject({ status: "CAPTURED", providerCaptureId: "CAP-1" });
    expect(orders.captureCalls).toHaveLength(0);
    expect(orders.getCalls).toEqual([{ id: "ORDER-1" }]);
  });

  it("adopts the existing capture when a duplicate capture is rejected", async () => {
    // Mirrors the real Sandbox failure: capture returns 422 "Order already
    // captured". The provider is the source of truth, so recover, don't fail.
    const alreadyCaptured = Object.assign(new Error(""), {
      statusCode: 422,
      result: {
        name: "UNPROCESSABLE_ENTITY",
        message:
          "Order already captured.If 'intent=CAPTURE' only one capture per order is allowed.",
      },
    });
    const orders = new FakeOrdersPort(
      { id: "ORDER-1", status: OrderStatus.Created },
      alreadyCaptured,
      orderWithCapture(),
    );
    const gateway = makeGateway(orders, await storeWithVault());
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome).toMatchObject({ status: "CAPTURED", providerCaptureId: "CAP-1" });
    expect(orders.captureCalls).toHaveLength(1);
    expect(orders.getCalls).toEqual([{ id: "ORDER-1" }]);
  });

  it("fails when the capture is rejected and the provider confirms no capture", async () => {
    const orders = new FakeOrdersPort(
      { id: "ORDER-1", status: OrderStatus.Created },
      new Error("declined"),
      { id: "ORDER-1", status: OrderStatus.Created },
    );
    const gateway = makeGateway(orders, await storeWithVault());
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome).toMatchObject({ status: "FAILED" });
  });

  it("fails safe when no payment method is enrolled", async () => {
    const orders = new FakeOrdersPort(new Error("unused"), new Error("unused"));
    const gateway = makeGateway(orders, new InMemoryPaymentMethodStore());
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome.status).toBe("FAILED");
    expect(orders.createCalls).toHaveLength(0);
  });

  it("fails safe when the provider errors on create", async () => {
    const orders = new FakeOrdersPort(new Error("boom"), new Error("unused"));
    const gateway = makeGateway(orders, await storeWithVault());
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome).toMatchObject({ status: "FAILED" });
  });

  it("fails safe when the provider errors on capture", async () => {
    const orders = new FakeOrdersPort(
      { id: "ORDER-1", status: OrderStatus.Created },
      new Error("declined"),
    );
    const gateway = makeGateway(orders, await storeWithVault());
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome).toMatchObject({ status: "FAILED" });
  });

  it("reports PENDING (not failure) when PayPal holds the capture for review", async () => {
    // Real Sandbox behavior for a vaulted PayPal-wallet capture: the order is
    // completed and a capture already exists, but it is PENDING_REVIEW. It must
    // not be treated as completed, nor counted, nor re-captured.
    const orders = new FakeOrdersPort(
      orderWithCapture({ id: "ORDER-1", captureStatus: CaptureStatus.Pending }),
      new Error("should not capture"),
    );
    const gateway = makeGateway(orders, await storeWithVault());
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome).toMatchObject({
      status: "PENDING",
      providerCaptureId: "CAP-1",
      amountMinor: 500,
      currency: "USD",
    });
    expect(orders.captureCalls).toHaveLength(0);
  });

  it("fails when PayPal reports a declined capture", async () => {
    const orders = new FakeOrdersPort(
      { id: "ORDER-1", status: OrderStatus.Created },
      orderWithCapture({ captureStatus: CaptureStatus.Declined }),
    );
    const gateway = makeGateway(orders, await storeWithVault());
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome).toMatchObject({ status: "FAILED" });
  });

  it("reports the provider's amount faithfully so the caller can detect a mismatch", async () => {
    const orders = new FakeOrdersPort(
      { id: "ORDER-1", status: OrderStatus.Created },
      orderWithCapture({ value: "9.99" }),
    );
    const gateway = makeGateway(orders, await storeWithVault());
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome).toMatchObject({ status: "CAPTURED", amountMinor: 999 });
  });
});

describe("PayPalPaymentGateway.checkCapture", () => {
  it("reports CAPTURED once a pending capture has settled", async () => {
    const payments = new FakePaymentsPort(capturedPayment({ status: CaptureStatus.Completed }));
    const gateway = makeGateway(
      new FakeOrdersPort(new Error("unused"), new Error("unused")),
      await storeWithVault(),
      payments,
    );
    const outcome = await gateway.checkCapture("CAP-1");
    expect(outcome).toMatchObject({
      status: "CAPTURED",
      providerCaptureId: "CAP-1",
      amountMinor: 500,
    });
    expect(payments.getCalls).toEqual([{ captureId: "CAP-1" }]);
  });

  it("keeps reporting PENDING while the capture is still open", async () => {
    const payments = new FakePaymentsPort(
      capturedPayment({ status: CaptureStatus.Pending, reason: CaptureIncompleteReason.PendingReview }),
    );
    const gateway = makeGateway(
      new FakeOrdersPort(new Error("unused"), new Error("unused")),
      await storeWithVault(),
      payments,
    );
    const outcome = await gateway.checkCapture("CAP-1");
    expect(outcome).toMatchObject({ status: "PENDING", reason: "PENDING_REVIEW" });
  });

  it("reports FAILED when the capture was declined", async () => {
    const payments = new FakePaymentsPort(capturedPayment({ status: CaptureStatus.Declined }));
    const gateway = makeGateway(
      new FakeOrdersPort(new Error("unused"), new Error("unused")),
      await storeWithVault(),
      payments,
    );
    const outcome = await gateway.checkCapture("CAP-1");
    expect(outcome).toMatchObject({ status: "FAILED" });
  });

  it("reports FAILED (never throws) when the provider read errors", async () => {
    const payments = new FakePaymentsPort(new Error("boom"));
    const gateway = makeGateway(
      new FakeOrdersPort(new Error("unused"), new Error("unused")),
      await storeWithVault(),
      payments,
    );
    const outcome = await gateway.checkCapture("CAP-1");
    expect(outcome).toMatchObject({ status: "FAILED" });
  });
});
