/**
 * Storage for the active spending rules.
 *
 * The MVP uses a single, global rule set (owner decision). Reads return `null`
 * when no rules have been configured yet; the engine treats missing rules as
 * fail-safe (`INVALID_RULES` -> `DENY`), so an unconfigured app permits nothing.
 *
 * This is an interface only. The pure engine never talks to storage directly;
 * the application loads rules through this interface and passes them in.
 */

import type { SpendingRules } from "./types";

export interface SpendingRulesStore {
  /** The active rules, or `null` if none have been configured. */
  getActive(): Promise<SpendingRules | null>;
  /** Persist the given rules as the active set, replacing any previous set. */
  save(rules: SpendingRules): Promise<void>;
}

/**
 * A simple in-memory rules store for tests and local development.
 *
 * NOT durable: rules are lost on restart. Like the other in-memory stores, it
 * exists to exercise the domain logic and prove the interface; the running
 * application persists rules durably (see `infra/persistence/ruleStore.ts`).
 */
export class InMemorySpendingRulesStore implements SpendingRulesStore {
  private rules: SpendingRules | null;

  constructor(initial: SpendingRules | null = null) {
    this.rules = initial;
  }

  async getActive(): Promise<SpendingRules | null> {
    return this.rules;
  }

  async save(rules: SpendingRules): Promise<void> {
    this.rules = rules;
  }
}
