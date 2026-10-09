/**
 * Reading the facts the authorization engine evaluates against.
 *
 * Shared by the agent's proposal path and the purchase approval/execution path
 * so that "how much has been spent" and "which payees are known" are computed
 * in exactly ONE place. If these ever diverged, the same request could get two
 * different answers depending on who asked.
 *
 * Pure with respect to its inputs: it only reads the injected stores.
 */

import type { PurchaseStore } from "../core/purchases";
import { SpendingLedger, utcMonthPeriod, type SpendingStore } from "../core/spending";

export interface SpendingStateStores {
  purchases: PurchaseStore;
  spending: SpendingStore;
}

export interface SpendingState {
  /** Verified captures in the current UTC calendar month, in minor units. */
  spentThisMonthMinor: number;
  /** Payees the owner has previously approved or paid. */
  knownPayees: string[];
}

/**
 * Read the current spending state.
 *
 * - `spentThisMonthMinor` counts ONLY verified captures (never proposals,
 *   approvals, submissions, or pending captures), for the current UTC month.
 * - `knownPayees` are payees from records in a positive state (`APPROVED` or
 *   `EXECUTED`). A denied or rejected request does not make its payee known.
 */
export async function readSpendingState(
  stores: SpendingStateStores,
  now: Date,
): Promise<SpendingState> {
  const ledger = new SpendingLedger(stores.spending);
  const spentThisMonthMinor = await ledger.capturedMinor(utcMonthPeriod(now));

  const records = await stores.purchases.list();
  const payees = new Set<string>();
  for (const record of records) {
    if (record.status === "APPROVED" || record.status === "EXECUTED") {
      payees.add(record.request.payee);
    }
  }

  return { spentThisMonthMinor, knownPayees: [...payees] };
}
