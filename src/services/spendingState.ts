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
import { capturedMinorIn, utcMonthPeriod, type SpendingStore } from "../core/spending";

export interface SpendingStateStores {
  purchases: PurchaseStore;
  spending: SpendingStore;
}

export interface SpendingState {
  /** Verified captures in the current UTC calendar month, in minor units. */
  spentThisMonthMinor: number;
  /** Payees the owner has previously approved or paid. */
  knownPayees: string[];
  /**
   * Verified captures in the current UTC calendar month that belong to
   * requests the owner's rules cleared automatically (trust mode). This is the
   * figure the engine checks against the monthly auto budget.
   */
  autoSpentThisMonthMinor: number;
}

/**
 * Read the current spending state.
 *
 * - `spentThisMonthMinor` counts ONLY verified captures (never proposals,
 *   approvals, submissions, or pending captures), for the current UTC month.
 * - `autoSpentThisMonthMinor` counts the same verified captures, restricted to
 *   requests carrying an `AUTO_APPROVED` ledger event. The marker is recorded
 *   at the moment the rules clear a purchase, so this is immutable history,
 *   not a guess from current record shapes. Pending captures do not count
 *   until they settle: the same honesty as the monthly cap.
 * - `knownPayees` are payees from records in a positive state (`APPROVED` or
 *   `EXECUTED`). A denied or rejected request does not make its payee known.
 */
export async function readSpendingState(
  stores: SpendingStateStores,
  now: Date,
): Promise<SpendingState> {
  const period = utcMonthPeriod(now);
  const events = await stores.spending.list();

  const autoApproved = new Set<string>();
  for (const event of events) {
    if (event.kind === "AUTO_APPROVED") autoApproved.add(event.requestId);
  }

  let autoSpentThisMonthMinor = 0;
  if (autoApproved.size > 0) {
    const start = Date.parse(period.startIso);
    const end = Date.parse(period.endIso);
    for (const event of events) {
      if (event.kind !== "CAPTURE_VERIFIED") continue;
      if (!autoApproved.has(event.requestId)) continue;
      const t = Date.parse(event.occurredAt);
      if (t >= start && t < end) autoSpentThisMonthMinor += event.amountMinor;
    }
  }

  const spentThisMonthMinor = capturedMinorIn(events, period);

  const records = await stores.purchases.list();
  const payees = new Set<string>();
  for (const record of records) {
    if (record.status === "APPROVED" || record.status === "EXECUTED") {
      payees.add(record.request.payee);
    }
  }

  return { spentThisMonthMinor, knownPayees: [...payees], autoSpentThisMonthMinor };
}
