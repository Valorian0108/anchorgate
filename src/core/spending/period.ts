/**
 * Monthly budget periods.
 *
 * The owner decided the budget period is the **UTC calendar month**: from the
 * 1st at 00:00:00.000Z (inclusive) to the 1st of the next month at
 * 00:00:00.000Z (exclusive). This module turns an instant into that half-open
 * window, so the ledger never has to guess a timezone.
 */

import type { SpendingPeriod } from "./types";

/**
 * The UTC calendar month containing `instant`.
 *
 * Throws on an unparseable instant: silently returning a wrong period could
 * mis-count spending, which is worse than failing loudly here.
 */
export function utcMonthPeriod(instant: Date | string): SpendingPeriod {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("utcMonthPeriod received an invalid instant.");
  }

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
