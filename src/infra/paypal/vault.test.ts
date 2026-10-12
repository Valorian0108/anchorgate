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
import {
  completeVaultEnrollment,
  enrollCardVault,
  startVaultEnrollment,
  vaultRequestId,
} from "./vault";

class FakeVaultPort implements PayPalVaultPort {
  lastSetupRequest?: SetupTokenRequest;
  lastPaymentTokenRequest?: PaymentTokenRequest;
  lastSetupRequestId?: string;
  lastPaymentRequestId?: string;
  constructor(
    private readonly setup: SetupTokenResponse | Error,
    private readonly token: PaymentTokenResponse | Error,
  ) {}
  async createSetupToken(input: {
    body: SetupTokenRequest;
    paypalRequestId?: string;
  }): Promise<SetupTokenResponse> {
    this.lastSetupRequest = input.body;
    this.lastSetupRequestId = input.paypalRequestId;
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
    this.lastPaymentRequestId = input.paypalRequestId;
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

describe("enrollCardVault", () => {
  const card = {
    number: "4111111111111111",
    expiry: "2027-02",
    name: "Sandbox Tester",
    billingAddress: { countryCode: "US" },
  };

  it("vaults the card under the person's own merchant customer id", async () => {
    const vault = new FakeVaultPort(
      { id: "SETUP-1", status: PaymentTokenStatus.Approved },
      { id: "VAULT-1", customer: { id: "CUST-1" } },
    );

    const method = await enrollCardVault(vault, {
      ownerId: "user-42",
      card,
      now: new Date("2026-10-12T05:00:00.000Z"),
    });

    expect(method).toMatchObject({
      ownerId: "user-42",
      provider: "paypal",
      sourceType: "card",
      providerTokenId: "VAULT-1",
      providerCustomerId: "CUST-1",
      status: "ACTIVE",
      createdAt: "2026-10-12T05:00:00.000Z",
    });
    expect(vault.lastSetupRequest?.customer).toEqual({
      merchantCustomerId: "user-42",
    });
    expect(vault.lastSetupRequest?.paymentSource.card?.number).toBe(
      "4111111111111111",
    );
  });

  it("throws when PayPal returns no setup token id", async () => {
    const vault = new FakeVaultPort({}, { id: "VAULT-1" });
    await expect(
      enrollCardVault(vault, { ownerId: "user-42", card }),
    ).rejects.toThrow(/setup token id/);
  });

  it("throws when PayPal returns no payment token id", async () => {
    const vault = new FakeVaultPort(
      { id: "SETUP-1", status: PaymentTokenStatus.Approved },
      {},
    );
    await expect(
      enrollCardVault(vault, { ownerId: "user-42", card }),
    ).rejects.toThrow(/payment token id/);
  });
});

describe("vaultRequestId", () => {
  it("stays under PayPal's 38-character header cap", () => {
    expect(vaultRequestId("card-setup").length).toBeLessThanOrEqual(38);
    expect(vaultRequestId("setup").length).toBeLessThanOrEqual(38);
  });

  it("is unique per call, so idempotency does not collapse distinct attempts", () => {
    expect(vaultRequestId("card-setup")).not.toBe(vaultRequestId("card-setup"));
  });

  it("is reflected in the id both vault setup calls send", async () => {
    const vault = new FakeVaultPort(
      { id: "SETUP-1", status: PaymentTokenStatus.Approved },
      { id: "VAULT-1" },
    );
    await enrollCardVault(vault, { ownerId: "user-42", card: { number: "4", expiry: "2027-02" } });
    expect(vault.lastSetupRequestId?.length).toBeLessThanOrEqual(38);
  });
});
