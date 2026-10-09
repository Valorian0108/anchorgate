/**
 * Deterministic purchase proposal service (Phase 5).
 *
 * This is the bridge between the AI agent and the authorization core. It does
 * NOT decide anything: it assembles the current facts (active rules, verified
 * spending this month, previously approved payees), asks the pure engine for a
 * verdict, and durably records the resulting purchase request.
 *
 * Keeping this deterministic and independent of the model is the whole point:
 * the AI proposes, this code files the request, and the engine decides.
 */

import { randomUUID } from "node:crypto";

import type {
  SpendingRules,
  SpendingRulesStore,
} from "../core/authorization";
import {
  proposePurchase,
  type ProposeOutcome,
  type PurchaseRecord,
  type PurchaseStore,
} from "../core/purchases";
import {
  SpendingLedger,
  utcMonthPeriod,
  type SpendingStore,
} from "../core/spending";
import { toPayPalAmount } from "../infra/paypal/money";

/** Everything the service needs, injected so it stays pure and testable. */
export interface ProposalServiceDeps {
  rules: SpendingRulesStore;
  purchases: PurchaseStore;
  spending: SpendingStore;
  /** Value recorded as the proposing `agentId`. */
  agentId: string;
  /** Clock. Injectable for deterministic tests. Defaults to the real clock. */
  now?: () => Date;
  /** Request-id generator. Injectable for deterministic tests. */
  newId?: () => string;
  /** Record informational `PROPOSED` ledger events (default: true). */
  recordProposalEvents?: boolean;
}

/** The untrusted shape the agent (or a caller) supplies. */
export interface ProposalInput {
  payee: string;
  purpose: string;
  category: string;
  amountMinor: number;
  currency: string;
}

/** The engine's verdict plus the durable record (null if the request was malformed). */
export type ProposalResult = ProposeOutcome;

/**
 * Files proposed purchases against the current rules and state.
 *
 * The service treats every input as untrusted: validation and the decision are
 * done by the authorization engine, never here.
 */
export class ProposalService {
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly recordProposalEvents: boolean;

  constructor(private readonly deps: ProposalServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => randomUUID());
    this.recordProposalEvents = deps.recordProposalEvents ?? true;
  }

  /** The currently active rules, or `null` if none are configured. */
  async activeRules(): Promise<SpendingRules | null> {
    return this.deps.rules.getActive();
  }

  /**
   * Propose a purchase. Loads current rules/state, runs the engine, and persists
   * the request when it is well-formed. Returns the engine's verdict unchanged.
   */
  async propose(input: ProposalInput): Promise<ProposalResult> {
    const now = this.now();
    const rules = await this.deps.rules.getActive();
    const state = await this.currentState(now);

    const request = {
      id: this.newId(),
      agentId: this.deps.agentId,
      payee: input.payee,
      purpose: input.purpose,
      category: input.category,
      amountMinor: input.amountMinor,
      currency: input.currency,
    };

    const outcome = proposePurchase(request, rules, state, now);

    if (outcome.record) {
      await this.deps.purchases.save(outcome.record);
      if (this.recordProposalEvents) {
        await this.recordProposed(outcome.record, now);
      }
    }

    return outcome;
  }

  /** The facts the engine evaluates against, read fresh for every proposal. */
  private async currentState(
    now: Date,
  ): Promise<{ spentThisMonthMinor: number; knownPayees: string[] }> {
    const ledger = new SpendingLedger(this.deps.spending);
    const spentThisMonthMinor = await ledger.capturedMinor(utcMonthPeriod(now));
    return { spentThisMonthMinor, knownPayees: await this.knownPayees() };
  }

  /**
   * Payees the owner has previously approved or paid. Only records in a
   * positive terminal state count; a denied or rejected request does not make
   * its payee "known".
   */
  private async knownPayees(): Promise<string[]> {
    const records = await this.deps.purchases.list();
    const payees = new Set<string>();
    for (const record of records) {
      if (record.status === "APPROVED" || record.status === "EXECUTED") {
        payees.add(record.request.payee);
      }
    }
    return [...payees];
  }

  /** Append an informational `PROPOSED` event so the ledger shows the attempt. */
  private async recordProposed(record: PurchaseRecord, now: Date): Promise<void> {
    const ledger = new SpendingLedger(this.deps.spending);
    await ledger.record({
      id: `proposed:${record.id}`,
      requestId: record.id,
      kind: "PROPOSED",
      amountMinor: record.request.amountMinor,
      currency: record.request.currency,
      occurredAt: now.toISOString(),
    });
  }
}

/**
 * A human-readable, money-formatted summary of the active rules.
 *
 * Used in the model's instructions and in the CLI so the agent can reason about
 * what is plausible — while remembering it still cannot decide anything.
 */
export function describeRules(rules: SpendingRules | null): string {
  if (!rules) {
    return "No spending rules are configured yet. Until rules are set, nothing can be authorized.";
  }
  const categories =
    rules.permittedCategories.length > 0
      ? rules.permittedCategories.join(", ")
      : "(none)";
  return [
    `- Currency: ${rules.currency}`,
    `- Automatic per-purchase limit: ${formatMinor(rules.perPurchaseAutoLimitMinor, rules.currency)} ` +
      "(above this, human approval is required)",
    `- Hard monthly cap: ${formatMinor(rules.monthlyCapMinor, rules.currency)} ` +
      "(approval can NEVER override this)",
    `- Permitted categories: ${categories}`,
    `- A first-time payee requires approval: ${rules.requireApprovalForNewPayee ? "yes" : "no"}`,
    `- Rule version: ${rules.ruleVersion}`,
  ].join("\n");
}

/** Format integer minor units for display. Falls back to raw units on error. */
function formatMinor(amountMinor: number, currency: string): string {
  try {
    return `${toPayPalAmount(amountMinor, currency)} ${currency}`;
  } catch {
    return `${amountMinor} ${currency} (minor units)`;
  }
}
