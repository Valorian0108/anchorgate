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

import type { AutoPaidPurchase } from "../core/authorization";
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
  /**
   * Material details of the purchases those verified auto captures belong to
   * (once-a-month rule, 18 oct 2026). The engine refuses to auto-pay the same
   * exact purchase twice in a month; a repeat asks the owner. Same honesty as
   * the budget figure: only confirmed payments count, so an auto-pay whose
   * capture never verified does not use up the item's month.
   */
  autoPaidThisMonth: AutoPaidPurchase[];
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
 * - `autoPaidThisMonth` carries the material details (the facts a fingerprint
 *   hashes) of the purchases behind those verified auto captures, so the
 *   engine can refuse to auto-pay the same exact purchase twice in a month
 *   (once-a-month rule, 18 oct 2026).
 * - `knownPayees` are payees from records in a positive state (`APPROVED` or
 *   `EXECUTED`). A denied or rejected request does not make its payee known.
 */
export async function readSpendingState(
  stores: SpendingStateStores,
  now: Date,
): Promise<SpendingState> {
  const period = utcMonthPeriod(now);
  const events = await stores.spending.list();
  const records = await stores.purchases.list();

  const autoApproved = new Set<string>();
  for (const event of events) {
    if (event.kind === "AUTO_APPROVED") autoApproved.add(event.requestId);
  }

  let autoSpentThisMonthMinor = 0;
  const autoPaidRequestIds = new Set<string>();
  if (autoApproved.size > 0) {
    const start = Date.parse(period.startIso);
    const end = Date.parse(period.endIso);
    for (const event of events) {
      if (event.kind !== "CAPTURE_VERIFIED") continue;
      if (!autoApproved.has(event.requestId)) continue;
      const t = Date.parse(event.occurredAt);
      if (t >= start && t < end) {
        autoSpentThisMonthMinor += event.amountMinor;
        autoPaidRequestIds.add(event.requestId);
      }
    }
  }

  // The material details behind those verified auto captures: the facts the
  // engine's once-a-month repeat check compares against (18 oct 2026).
  const autoPaidThisMonth: AutoPaidPurchase[] = [];
  for (const record of records) {
    if (!autoPaidRequestIds.has(record.id)) continue;
    const request = record.request;
    autoPaidThisMonth.push({
      payee: request.payee,
      purpose: request.purpose,
      category: request.category,
      amountMinor: request.amountMinor,
      currency: request.currency,
    });
  }

  const spentThisMonthMinor = capturedMinorIn(events, period);

  const payees = new Set<string>();
  for (const record of records) {
    if (record.status === "APPROVED" || record.status === "EXECUTED") {
      payees.add(record.request.payee);
    }
  }

  return {
    spentThisMonthMinor,
    knownPayees: [...payees],
    autoSpentThisMonthMinor,
    autoPaidThisMonth,
  };
}
