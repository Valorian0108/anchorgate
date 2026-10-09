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
