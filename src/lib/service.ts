/**
 * Application service wiring (server-side only).
 *
 * Builds the real `PurchaseService` from environment configuration: Drizzle
 * stores over the Supabase Postgres connection, and a lazily-constructed PayPal
 * Sandbox gateway (only built when a payment command actually needs it).
 *
 * SECURITY: connection string and PayPal credentials live in the environment
 * and never leave the server. Nothing here is imported by client components.
 */

import { createDatabase } from "@/infra/persistence";
import {
  DrizzlePaymentMethodStore,
  DrizzlePurchaseStore,
  DrizzleSpendingRulesStore,
  DrizzleSpendingStore,
} from "@/infra/persistence";
import {
  createPayPalClient,
  PayPalPaymentGateway,
  readPayPalConfigFromEnv,
  SdkOrdersPort,
  SdkPaymentsPort,
} from "@/infra/paypal";
import { PurchaseService } from "@/services";

let cached: PurchaseService | null = null;

export function getService(): PurchaseService {
  if (cached) return cached;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Cannot build the purchase service.");
  }

  const { db } = createDatabase(connectionString);
  const purchases = new DrizzlePurchaseStore(db);
  const spending = new DrizzleSpendingStore(db);
  const rules = new DrizzleSpendingRulesStore(db);
  const paymentMethods = new DrizzlePaymentMethodStore(db);

  cached = new PurchaseService({
    purchases,
    spending,
    rules,
    paymentGateway: () => {
      const config = readPayPalConfigFromEnv(process.env);
      const client = createPayPalClient(config);
      return new PayPalPaymentGateway({
        orders: new SdkOrdersPort(client),
        payments: new SdkPaymentsPort(client),
        paymentMethods,
      });
    },
  });

  return cached;
}