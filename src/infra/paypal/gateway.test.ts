/**
 * Tests for the PayPal payment gateway.
 *
 * These run against a FAKE PayPal port, so they prove our logic (exact amount,
 * vault usage, receipt extraction, fail-safe behavior) without a network. Per
 * the engineering standard, real Sandbox verification is tracked separately.
 */

import {
  CaptureStatus,
  CheckoutPaymentIntent,
  OrderStatus,
  PaymentInitiator,
  StoredPaymentSourceUsageType,
  type Order,
  type OrderRequest,
} from "@paypal/paypal-server-sdk";
import { describe, expect, it } from "vitest";

import type { PaymentInstruction } from "../../core/execution";
import { InMemoryPaymentMethodStore } from "../../core/payments";
import { buildCreateOrderBody, PayPalPaymentGateway } from "./gateway";
import type { PayPalOrdersPort } from "./ports";

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
  constructor(
    private readonly createResult: Order | Error,
    private readonly captureResult: Order | Error,
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
    const gateway = new PayPalPaymentGateway({
      orders,
      paymentMethods: await storeWithVault(),
    });

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

  it("does not capture when create already completed", async () => {
    const orders = new FakeOrdersPort(orderWithCapture(), new Error("should not capture"));
    const gateway = new PayPalPaymentGateway({
      orders,
      paymentMethods: await storeWithVault(),
    });
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome.status).toBe("CAPTURED");
    expect(orders.captureCalls).toHaveLength(0);
  });

  it("fails safe when no payment method is enrolled", async () => {
    const orders = new FakeOrdersPort(new Error("unused"), new Error("unused"));
    const gateway = new PayPalPaymentGateway({
      orders,
      paymentMethods: new InMemoryPaymentMethodStore(),
    });
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome.status).toBe("FAILED");
    expect(orders.createCalls).toHaveLength(0);
  });

  it("fails safe when the provider errors on create", async () => {
    const orders = new FakeOrdersPort(new Error("boom"), new Error("unused"));
    const gateway = new PayPalPaymentGateway({
      orders,
      paymentMethods: await storeWithVault(),
    });
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome).toMatchObject({ status: "FAILED" });
  });

  it("fails safe when the provider errors on capture", async () => {
    const orders = new FakeOrdersPort(
      { id: "ORDER-1", status: OrderStatus.Created },
      new Error("declined"),
    );
    const gateway = new PayPalPaymentGateway({
      orders,
      paymentMethods: await storeWithVault(),
    });
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome).toMatchObject({ status: "FAILED" });
  });

  it("fails safe when no capture completed", async () => {
    const orders = new FakeOrdersPort(
      { id: "ORDER-1", status: OrderStatus.Created },
      orderWithCapture({ captureStatus: CaptureStatus.Pending }),
    );
    const gateway = new PayPalPaymentGateway({
      orders,
      paymentMethods: await storeWithVault(),
    });
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome).toMatchObject({ status: "FAILED" });
  });

  it("reports the provider's amount faithfully so the caller can detect a mismatch", async () => {
    const orders = new FakeOrdersPort(
      { id: "ORDER-1", status: OrderStatus.Created },
      orderWithCapture({ value: "9.99" }),
    );
    const gateway = new PayPalPaymentGateway({
      orders,
      paymentMethods: await storeWithVault(),
    });
    const outcome = await gateway.pay(INSTRUCTION);
    expect(outcome).toMatchObject({ status: "CAPTURED", amountMinor: 999 });
  });
});
