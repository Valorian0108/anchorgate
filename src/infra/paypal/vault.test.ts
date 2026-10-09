/**
 * Tests for PayPal vault enrollment, against a fake vault port.
 */

import {
  PaypalPaymentTokenCustomerType,
  PaypalPaymentTokenUsageType,
  PaymentTokenStatus,
  type PaymentTokenRequest,
  type PaymentTokenResponse,
  type SetupTokenRequest,
  type SetupTokenResponse,
} from "@paypal/paypal-server-sdk";
import { describe, expect, it } from "vitest";

import type { PayPalVaultPort } from "./ports";
import { completeVaultEnrollment, startVaultEnrollment } from "./vault";

class FakeVaultPort implements PayPalVaultPort {
  lastSetupRequest?: SetupTokenRequest;
  lastPaymentTokenRequest?: PaymentTokenRequest;
  constructor(
    private readonly setup: SetupTokenResponse | Error,
    private readonly token: PaymentTokenResponse | Error,
  ) {}
  async createSetupToken(input: {
    body: SetupTokenRequest;
    paypalRequestId?: string;
  }): Promise<SetupTokenResponse> {
    this.lastSetupRequest = input.body;
    if (this.setup instanceof Error) throw this.setup;
    return this.setup;
  }
  async getSetupToken(): Promise<SetupTokenResponse> {
    if (this.setup instanceof Error) throw this.setup;
    return this.setup;
  }
  async createPaymentToken(input: {
    body: PaymentTokenRequest;
    paypalRequestId?: string;
  }): Promise<PaymentTokenResponse> {
    this.lastPaymentTokenRequest = input.body;
    if (this.token instanceof Error) throw this.token;
    return this.token;
  }
}

describe("startVaultEnrollment", () => {
  it("returns the setup token id and approval URL", async () => {
    const vault = new FakeVaultPort(
      {
        id: "SETUP-1",
        status: PaymentTokenStatus.Created,
        links: [
          { href: "https://sandbox.paypal.com/self", rel: "self" },
          { href: "https://sandbox.paypal.com/approve?token=SETUP-1", rel: "approve" },
        ],
      },
      new Error("unused"),
    );

    const start = await startVaultEnrollment(vault, {
      returnUrl: "https://app.example/return",
      cancelUrl: "https://app.example/cancel",
      merchantCustomerId: "default",
    });

    expect(start).toEqual({
      setupTokenId: "SETUP-1",
      approveUrl: "https://sandbox.paypal.com/approve?token=SETUP-1",
    });
    const paypal = vault.lastSetupRequest?.paymentSource.paypal;
    expect(paypal?.usageType).toBe(PaypalPaymentTokenUsageType.Merchant);
    expect(paypal?.customerType).toBe(PaypalPaymentTokenCustomerType.Consumer);
    expect(paypal?.experienceContext?.returnUrl).toBe("https://app.example/return");
    expect(paypal?.experienceContext?.cancelUrl).toBe("https://app.example/cancel");
  });

  it("throws when PayPal returns no setup token id", async () => {
    const vault = new FakeVaultPort({ links: [] }, new Error("unused"));
    await expect(
      startVaultEnrollment(vault, { returnUrl: "r", cancelUrl: "c" }),
    ).rejects.toThrow(/setup token id/);
  });

  it("throws when PayPal returns no approval link", async () => {
    const vault = new FakeVaultPort({ id: "SETUP-1", links: [] }, new Error("unused"));
    await expect(
      startVaultEnrollment(vault, { returnUrl: "r", cancelUrl: "c" }),
    ).rejects.toThrow(/approval link/);
  });
});

describe("completeVaultEnrollment", () => {
  it("exchanges an approved setup token for a saved payment method", async () => {
    const vault = new FakeVaultPort(
      { id: "SETUP-1", status: PaymentTokenStatus.Approved },
      {
        id: "VAULT-1",
        customer: { id: "CUST-1" },
        paymentSource: { paypal: { emailAddress: "buyer@example.com" } },
      },
    );

    const method = await completeVaultEnrollment(vault, {
      setupTokenId: "SETUP-1",
      ownerId: "default",
      now: new Date("2026-10-09T12:00:00.000Z"),
    });

    expect(method).toMatchObject({
      ownerId: "default",
      provider: "paypal",
      providerTokenId: "VAULT-1",
      providerCustomerId: "CUST-1",
      payerEmail: "buyer@example.com",
      status: "ACTIVE",
      createdAt: "2026-10-09T12:00:00.000Z",
    });
    expect(vault.lastPaymentTokenRequest?.paymentSource.token).toEqual({
      id: "SETUP-1",
      type: "SETUP_TOKEN",
    });
  });

  it("throws when the setup token is not approved", async () => {
    const vault = new FakeVaultPort(
      { id: "SETUP-1", status: PaymentTokenStatus.PayerActionRequired },
      new Error("unused"),
    );
    await expect(
      completeVaultEnrollment(vault, { setupTokenId: "SETUP-1", ownerId: "default" }),
    ).rejects.toThrow(/not approved/);
  });

  it("throws when PayPal returns no payment token id", async () => {
    const vault = new FakeVaultPort(
      { id: "SETUP-1", status: PaymentTokenStatus.Approved },
      {},
    );
    await expect(
      completeVaultEnrollment(vault, { setupTokenId: "SETUP-1", ownerId: "default" }),
    ).rejects.toThrow(/payment token id/);
  });
});
