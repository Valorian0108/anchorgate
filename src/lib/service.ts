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

import type { SpendingRules } from "@/core/authorization";
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
import {
  createAgentModel,
  createPurchaseAgent,
  ProposalService,
  readAgentConfig,
  type PurchaseAgent,
} from "@/agent";

interface Stores {
  purchases: DrizzlePurchaseStore;
  spending: DrizzleSpendingStore;
  rules: DrizzleSpendingRulesStore;
  paymentMethods: DrizzlePaymentMethodStore;
}

let stores: Stores | null = null;
let cached: PurchaseService | null = null;

function getStores(): Stores {
  if (stores) return stores;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Cannot build the purchase service.");
  }

  const { db } = createDatabase(connectionString);
  stores = {
    purchases: new DrizzlePurchaseStore(db),
    spending: new DrizzleSpendingStore(db),
    rules: new DrizzleSpendingRulesStore(db),
    paymentMethods: new DrizzlePaymentMethodStore(db),
  };
  return stores;
}

export function getService(): PurchaseService {
  if (cached) return cached;

  const s = getStores();

  cached = new PurchaseService({
    purchases: s.purchases,
    spending: s.spending,
    rules: s.rules,
    paymentGateway: () => {
      const config = readPayPalConfigFromEnv(process.env);
      const client = createPayPalClient(config);
      return new PayPalPaymentGateway({
        orders: new SdkOrdersPort(client),
        payments: new SdkPaymentsPort(client),
        paymentMethods: s.paymentMethods,
      });
    },
  });

  return cached;
}

/**
 * The active spending rules, for server-side callers that need policy facts
 * (e.g. explaining a front-door refusal). Never exposed to the client.
 */
export async function getActiveRules(): Promise<SpendingRules | null> {
  return getStores().rules.getActive();
}

/**
 * Persist a new active rule set. Only the Rules editor calls this, and only
 * after the owner is verified. Recorded decisions keep the rule version they
 * were judged under, so replacing the active set never rewrites history.
 */
export async function saveRules(rules: SpendingRules): Promise<void> {
  return getStores().rules.save(rules);
}

/**
 * The proposal-only AI agent, wired to the same durable stores as the service.
 * Server-side only. It can propose a purchase; it can never approve or pay.
 * Built fresh per call so the model always sees the currently active rules.
 */
export async function getAgent(): Promise<PurchaseAgent> {
  const s = getStores();
  const config = readAgentConfig();
  const rules = await s.rules.getActive();
  const proposals = new ProposalService({
    rules: s.rules,
    purchases: s.purchases,
    spending: s.spending,
    agentId: config.agentId,
  });
  return createPurchaseAgent({
    model: createAgentModel(config),
    proposals,
    rules,
  });
}