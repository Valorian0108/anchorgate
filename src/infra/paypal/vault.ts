/**
 * PayPal vault enrollment (Phase 4).
 *
 * To let the agent pay without a human present, the user saves ("vaults") a
 * payment method ONCE. This module implements the two documented steps:
 *
 *   1. `startVaultEnrollment`  -> create a setup token and get the approval URL
 *                                 the user visits in the PayPal Sandbox.
 *   2. `completeVaultEnrollment` -> after approval, exchange the setup token for
 *                                 a durable payment token (the vault id), and
 *                                 return the `SavedPaymentMethod` to store.
 *
 * The vault id is a secret handle. This module returns it only inside the
 * `SavedPaymentMethod` for the caller to persist; it never logs it.
 */

import { randomUUID } from "node:crypto";

import {
  PaypalPaymentTokenCustomerType,
  PaypalPaymentTokenUsageType,
  PaymentTokenStatus,
  VaultTokenRequestType,
  type LinkDescription,
} from "@paypal/paypal-server-sdk";

import type { SavedPaymentMethod } from "../../core/payments";
import type { PayPalVaultPort } from "./ports";

export interface StartVaultEnrollmentArgs {
  returnUrl: string;
  cancelUrl: string;
  /** Our stable id for the owner, so the vault is tied to the right profile. */
  merchantCustomerId?: string;
}

export interface VaultEnrollmentStart {
  setupTokenId: string;
  /** URL the user opens in the browser to approve saving their payment method. */
  approveUrl: string;
}

function findApproveUrl(links: LinkDescription[] | undefined): string | null {
  const link = links?.find(
    (l) => l.rel === "approve" || l.rel === "setup_now" || l.rel === "action_url",
  );
  if (link) return link.href;
  return links?.find((l) => l.href.includes("approve"))?.href ?? null;
}

/** Step 1: create a setup token and return the approval link. */
export async function startVaultEnrollment(
  vault: PayPalVaultPort,
  args: StartVaultEnrollmentArgs,
): Promise<VaultEnrollmentStart> {
  const response = await vault.createSetupToken({
    body: {
      ...(args.merchantCustomerId
        ? { customer: { merchantCustomerId: args.merchantCustomerId } }
        : {}),
      paymentSource: {
        paypal: {
          description: "Authorize agent spending within set limits",
          usageType: PaypalPaymentTokenUsageType.Merchant,
          customerType: PaypalPaymentTokenCustomerType.Consumer,
          experienceContext: {
            returnUrl: args.returnUrl,
            cancelUrl: args.cancelUrl,
          },
        },
      },
    },
    paypalRequestId: `setup:${args.merchantCustomerId ?? "default"}:${Date.now()}`,
  });

  if (!response.id) {
    throw new Error("PayPal did not return a setup token id.");
  }
  const approveUrl = findApproveUrl(response.links);
  if (!approveUrl) {
    throw new Error("PayPal did not return an approval link for the setup token.");
  }
  return { setupTokenId: response.id, approveUrl };
}

export interface CompleteVaultEnrollmentArgs {
  setupTokenId: string;
  ownerId: string;
  now?: Date;
}

/**
 * Step 2: after the user approves, exchange the setup token for a durable payment
 * token and describe it as a `SavedPaymentMethod`.
 */
export async function completeVaultEnrollment(
  vault: PayPalVaultPort,
  args: CompleteVaultEnrollmentArgs,
): Promise<SavedPaymentMethod> {
  const setup = await vault.getSetupToken(args.setupTokenId);
  if (
    setup.status !== PaymentTokenStatus.Approved &&
    setup.status !== PaymentTokenStatus.Vaulted
  ) {
    throw new Error(
      `Setup token ${args.setupTokenId} is not approved yet ` +
        `(status: ${setup.status ?? "unknown"}).`,
    );
  }

  const token = await vault.createPaymentToken({
    body: {
      paymentSource: {
        token: { id: args.setupTokenId, type: VaultTokenRequestType.SetupToken },
      },
    },
    paypalRequestId: `vault:${args.setupTokenId}`,
  });

  if (!token.id) {
    throw new Error("PayPal did not return a payment token id.");
  }

  return {
    id: randomUUID(),
    ownerId: args.ownerId,
    provider: "paypal",
    providerTokenId: token.id,
    providerCustomerId: token.customer?.id,
    payerEmail: token.paymentSource?.paypal?.emailAddress,
    status: "ACTIVE",
    createdAt: (args.now ?? new Date()).toISOString(),
  };
}
