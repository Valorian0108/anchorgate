/**
 * Application service wiring (server-side only).
 *
 * Builds the real `PurchaseService` from environment configuration: Drizzle
 * stores over the Supabase Postgres connection, and a lazily-constructed PayPal
 * Sandbox gateway (only built when a payment command actually needs it).
 *
 * Every entry point takes the signed-in user's id (from the auth DAL) and
 * returns a service whose stores are scoped to that person: their requests,
 * their ledger, their rules, their vault. One cached service per user.
 *
 * SECURITY: connection string and PayPal credentials live in the environment
 * and never leave the server. Nothing here is imported by client components.
 */

import type { SpendingRules } from "@/core/authorization";
import { createDatabase, type DatabaseHandle } from "@/infra/persistence";
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

let database: DatabaseHandle | null = null;
const services = new Map<string, PurchaseService>();

function getDatabase(): DatabaseHandle {
  if (database) return database;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Cannot build the purchase service.");
  }

  database = createDatabase(connectionString);
  return database;
}

/** Stores scoped to one person. Cheap wrappers; built per service, not cached. */
function storesFor(userId: string): Stores {
  const { db } = getDatabase();
  return {
    purchases: new DrizzlePurchaseStore(db, userId),
    spending: new DrizzleSpendingStore(db, userId),
    rules: new DrizzleSpendingRulesStore(db, userId),
    paymentMethods: new DrizzlePaymentMethodStore(db, userId),
  };
}

/** The purchase service for one signed-in person (cached per user id). */
export function getService(userId: string): PurchaseService {
  const hit = services.get(userId);
  if (hit) return hit;

  const s = storesFor(userId);

  const service = new PurchaseService({
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
        ownerId: userId,
      });
    },
  });

  services.set(userId, service);
  return service;
}

/**
 * The active spending rules for one person, for server-side callers that need
 * policy facts (e.g. explaining a front-door refusal). Never exposed to the
 * client.
 */
export async function getActiveRules(userId: string): Promise<SpendingRules | null> {
  return storesFor(userId).rules.getActive();
}

/**
 * Persist a new active rule set for one person. Only the Rules editor calls
 * this, and only after the person is verified. Recorded decisions keep the rule
 * version they were judged under, so replacing the active set never rewrites
 * history.
 */
export async function saveRules(userId: string, rules: SpendingRules): Promise<void> {
  return storesFor(userId).rules.save(rules);
}

/**
 * The proposal-only AI agent for one person, wired to the same durable stores
 * as their service. Server-side only. It can propose a purchase; it can never
 * approve or pay. Built fresh per call so the model always sees the currently
 * active rules of the signed-in person, and only theirs.
 */
export async function getAgent(userId: string): Promise<PurchaseAgent> {
  const s = storesFor(userId);
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
