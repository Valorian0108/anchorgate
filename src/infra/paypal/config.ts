/**
 * PayPal SDK client configuration (Phase 4).
 *
 * SECURITY:
 *   - Credentials are read from the environment by the application layer and
 *     passed in here; this module never reads `process.env` itself.
 *   - This project is **Sandbox-only**. Live (production) mode is refused
 *     outright, so a stray environment variable cannot move real money.
 *   - Nothing here logs or returns secrets.
 */

import {
  Client,
  Environment,
  type OrderRequest,
  OrdersController,
  VaultController,
} from "@paypal/paypal-server-sdk";

import type { PayPalOrdersPort, PayPalVaultPort } from "./ports";

export interface PayPalConfig {
  environment: "sandbox";
  clientId: string;
  clientSecret: string;
}

/**
 * Read and validate PayPal configuration from an environment map.
 * Fails closed: any missing value throws, and production is refused.
 */
export function readPayPalConfigFromEnv(env: NodeJS.ProcessEnv): PayPalConfig {
  const rawEnv = (env.PAYPAL_ENV ?? "sandbox").trim().toLowerCase();
  if (rawEnv !== "sandbox") {
    throw new Error(
      `PayPal environment ${JSON.stringify(env.PAYPAL_ENV)} is not allowed. ` +
        `This project is Sandbox-only.`,
    );
  }
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must both be set (Sandbox).",
    );
  }
  return { environment: "sandbox", clientId, clientSecret };
}

/** Build an SDK client from validated config. */
export function createPayPalClient(config: PayPalConfig): Client {
  return new Client({
    environment: Environment.Sandbox,
    clientCredentialsAuthCredentials: {
      oAuthClientId: config.clientId,
      oAuthClientSecret: config.clientSecret,
    },
  });
}

/** Wrap an SDK client in the narrow order port. */
export class SdkOrdersPort implements PayPalOrdersPort {
  private readonly orders: OrdersController;
  constructor(client: Client) {
    this.orders = new OrdersController(client);
  }
  async createOrder(input: {
    body: OrderRequest;
    paypalRequestId: string;
    prefer?: string;
  }): Promise<import("@paypal/paypal-server-sdk").Order> {
    const response = await this.orders.createOrder(input);
    return response.result;
  }
  async captureOrder(input: {
    id: string;
    paypalRequestId: string;
    prefer?: string;
  }): Promise<import("@paypal/paypal-server-sdk").Order> {
    const response = await this.orders.captureOrder(input);
    return response.result;
  }
}

/** Wrap an SDK client in the narrow vault port. */
export class SdkVaultPort implements PayPalVaultPort {
  private readonly vault: VaultController;
  constructor(client: Client) {
    this.vault = new VaultController(client);
  }
  async createSetupToken(input: {
    body: import("@paypal/paypal-server-sdk").SetupTokenRequest;
    paypalRequestId?: string;
  }): Promise<import("@paypal/paypal-server-sdk").SetupTokenResponse> {
    const response = await this.vault.createSetupToken(input);
    return response.result;
  }
  async getSetupToken(id: string): Promise<import("@paypal/paypal-server-sdk").SetupTokenResponse> {
    const response = await this.vault.getSetupToken(id);
    return response.result;
  }
  async createPaymentToken(input: {
    body: import("@paypal/paypal-server-sdk").PaymentTokenRequest;
    paypalRequestId?: string;
  }): Promise<import("@paypal/paypal-server-sdk").PaymentTokenResponse> {
    const response = await this.vault.createPaymentToken(input);
    return response.result;
  }
}
