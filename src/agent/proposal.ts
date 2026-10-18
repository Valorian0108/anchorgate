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
  type SpendingStore,
} from "../core/spending";
import { toPayPalAmount } from "../infra/paypal/money";
import { readSpendingState } from "../services/spendingState";

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
    const state = await readSpendingState(this.deps, now);

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
    // Honest in both modes: with AI authorization off (the shipped default)
    // the model is told plainly that nothing is paid automatically. With it
    // on, the model is told the exact list and budget, entry by entry, so it
    // can never imply that something clears which is not on that list, and a
    // filed ask for a listed item carries the exact strings the engine
    // matches on.
    ...autoModeLines(rules),
    `- Hard monthly cap: ${formatMinor(rules.monthlyCapMinor, rules.currency)} ` +
      "(approval can NEVER override this)",
    `- Permitted categories: ${categories}`,
    `- Rule version: ${rules.ruleVersion}`,
  ].join("\n");
}

/** The honest auto-mode lines for the model's instructions (trust mode). */
function autoModeLines(rules: SpendingRules): string[] {
  if (!rules.autoApproveEnabled) {
    return [
      "- Auto-approve is OFF: every proposal waits for the owner's approval; " +
        "nothing is paid automatically",
    ];
  }
  const entries = rules.autoAllowlist ?? [];
  if (entries.length === 0) {
    return [
      "- AI authorization is ON but the trust list is empty: every proposal " +
        "still waits for the owner",
    ];
  }
  return [
    "- AI authorization is ON. These exact purchases clear automatically " +
      "(seller, purpose, price), each at most once a month:",
    ...entries.map(
      (entry) =>
        `  - ${entry.payee} · ${entry.purpose} · ` +
        `${formatMinor(entry.amountMinor, rules.currency)}`,
    ),
    `- Auto budget for the month: ${formatMinor(rules.autoBudgetMinor ?? 0, rules.currency)}`,
    "- Anything not on that list, at a different price, already auto-paid this " +
      "month, or after the budget runs out waits for the owner",
  ];
}

/** Format integer minor units for display. Falls back to raw units on error. */
function formatMinor(amountMinor: number, currency: string): string {
  try {
    return `${toPayPalAmount(amountMinor, currency)} ${currency}`;
  } catch {
    return `${amountMinor} ${currency} (minor units)`;
  }
}
