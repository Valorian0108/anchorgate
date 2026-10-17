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
  enrollCardVault,
  PayPalPaymentGateway,
  readPayPalConfigFromEnv,
  SdkOrdersPort,
  SdkPaymentsPort,
  SdkVaultPort,
} from "@/infra/paypal";
import { PurchaseService } from "@/services";
import { SpendingLedger } from "@/core/spending";
import { shortRef } from "@/lib/format";
import {
  CATALOG_AGENT_ID,
  catalogArrivalDue,
  catalogShouldHoldBack,
  catalogState,
  createAgentModel,
  createPurchaseAgent,
  ProposalService,
  readAgentConfig,
  surfaceCatalogPurchase,
  type PurchaseAgent,
} from "@/agent";
import type { PurchaseRecord } from "@/core/purchases";

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

/**
 * Surface the next catalog item as a real purchase request, if one is due.
 *
 * The live Gate feed's one server-side step. It reads the person's own records
 * and rules, refuses when nothing is due (so a reload or a second tab can never
 * double-file), picks the next item deterministically, and files it through the
 * same `ProposalService` as everything else. The engine still decides, and the
 * catalog itself can never approve, pay, or widen a rule. Under trust mode
 * (owner decision, 16 oct 2026) an item that exactly matches the owner's list,
 * inside the auto budget, comes back already cleared by the engine; it is then
 * settled through the same re-gated payment path as everything else, so the
 * Gate shows the arrival as it truly is.
 *
 * Returns the new record (with its short capture reference when trust mode
 * settled it), or null when no rules are set, no item is permitted, the owner
 * is already behind on several, or the last arrival was too recent to be due.
 */
export async function surfaceNextCatalog(
  userId: string,
  now: Date = new Date(),
): Promise<AutoSettleResult | null> {
  const s = storesFor(userId);

  const rules = await s.rules.getActive();
  if (!rules) return null;

  const records = await s.purchases.list();
  if (catalogShouldHoldBack(records)) return null;

  const { proposedCount, lastArrivalAt } = catalogState(records);
  if (!catalogArrivalDue({ lastArrivalAt, nowMs: now.getTime() })) return null;

  const proposals = new ProposalService({
    rules: s.rules,
    purchases: s.purchases,
    spending: s.spending,
    agentId: CATALOG_AGENT_ID,
  });

  const result = await surfaceCatalogPurchase({ proposals, seed: userId, proposedCount });
  const record = result?.record ?? null;
  if (!record) return null;

  // Cleared by the owner's trust list: settle it now (mark, re-gate, capture),
  // and hand back the settled record plus its reference, so the Gate shows the
  // arrival as it truly is: paid, not waiting.
  if (record.status === "AUTHORIZED") {
    return settleAutoAuthorized(userId, record);
  }
  return { record };
}

/** The result of settling a purchase the owner's rules just cleared. */
export interface AutoSettleResult {
  /** The record after settlement: paid, settling, queued, denied, or still cleared. */
  record: PurchaseRecord;
  /** The short capture reference, present only when a capture was verified. */
  ref?: string;
}

/**
 * Settle a purchase the engine cleared automatically (status `AUTHORIZED`).
 *
 * Two steps, in this order:
 *   1. Mark it in the ledger with an informational `AUTO_APPROVED` event
 *      (idempotent by request id). This is the immutable record that the
 *      owner's rules cleared it, and it is how the monthly auto budget is
 *      computed from then on.
 *   2. Run the existing payment path, which re-runs the deterministic gate
 *      immediately before the provider is touched. If the rules changed
 *      between proposal and payment, the record drops back into the owner's
 *      queue (or is denied) instead of paying; if the provider declines, the
 *      record stays cleared-but-unpaid and every screen says so honestly.
 *
 * This function contains no policy: the engine decided before it was called,
 * and the engine decides again inside `pay`.
 */
export async function settleAutoAuthorized(
  userId: string,
  record: PurchaseRecord,
): Promise<AutoSettleResult> {
  if (record.status !== "AUTHORIZED") {
    return { record };
  }

  const s = storesFor(userId);
  const ledger = new SpendingLedger(s.spending);
  await ledger.record({
    id: `auto-approved:${record.id}`,
    requestId: record.id,
    kind: "AUTO_APPROVED",
    amountMinor: record.request.amountMinor,
    currency: record.request.currency,
    occurredAt: new Date().toISOString(),
    note: "Cleared automatically under the owner's trust list.",
  });

  const paid = await getService(userId).pay(record.id, { reconcilePending: true });
  const capture = paid.outcome.capture;
  return {
    record: paid.outcome.record,
    ...(capture ? { ref: shortRef(capture.providerCaptureId) } : {}),
  };
}

/** PayPal's standard Sandbox test card (Visa, always approves, no 3DS). */
const SANDBOX_TEST_CARD = {
  number: "4111111111111111",
  expiry: "2027-02",
  name: "Sandbox Tester",
  billingAddress: {
    addressLine1: "2211 N First Street",
    adminArea1: "CA",
    adminArea2: "San Jose",
    postalCode: "95131",
    countryCode: "US",
  },
};

/**
 * Make sure one person has a payment method in their vault, enrolling PayPal's
 * public Sandbox test card server-side when they do not. This is a SANDBOX-ONLY
 * convenience so a fresh account can live the whole arc (ask, approve, pay,
 * see the reference) without a CLI; in production the card would be enrolled
 * through PayPal's own hosted fields.
 *
 * Throws when the database or PayPal credentials are missing, or when the
 * enrollment fails. Callers decide how loud to be: sign-in flows treat it as
 * best-effort, because a person without a card can still set rules and ask;
 * the pay step then fails with its own honest sentence.
 */
export async function ensureSandboxCard(userId: string): Promise<void> {
  const s = storesFor(userId);
  const existing = await s.paymentMethods.getActive(userId);
  if (existing) return;

  const config = readPayPalConfigFromEnv(process.env);
  const client = createPayPalClient(config);
  const method = await enrollCardVault(new SdkVaultPort(client), {
    ownerId: userId,
    card: SANDBOX_TEST_CARD,
  });
  await s.paymentMethods.save(method);
}
