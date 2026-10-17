/**
 * Rules editing from the Rules page: parse the amounts the owner types and
 * advance the rule version on save.
 *
 * The page collects the monthly limit and, under trust mode (owner decision,
 * 16 oct 2026), the AI authorization section: the toggle, the exact prices of
 * the listed items, and the one auto budget number. The helpers here are pure
 * and unit-tested; the server actions compose them with the durable store, and
 * the engine is never involved here (it re-reads the saved rules fresh on the
 * next decision).
 */

import type { AutoAllowlistEntry, SpendingRules } from "@/core/authorization";

/**
 * The categories a brand-new gate starts with. The monthly limit is the only
 * part a person edits in the app; the rest of the rule set mirrors the
 * command-line defaults so a fresh account behaves like the documented demo.
 */
export const STARTING_CATEGORIES: readonly string[] = [
  "software",
  "office_supplies",
  "hardware",
  "books",
  "cloud_services",
  "advertising",
  "travel",
  "meals",
];

/**
 * The first rule set for a brand-new person, built from their monthly limit.
 * `autoMinor` seeds the retired per-purchase line; the action passes 0, the
 * safest value it could ever have. Version "owner-1": the first set is not a
 * bump of anything. New sellers always need approval (fail-safe on), and the
 * currency is USD, matching the sandbox the whole product runs on.
 *
 * Trust mode (owner decision, 16 oct 2026) still starts OFF: a brand-new
 * person's list is empty, the auto budget is zero, and every request inside
 * the cap needs the owner until they switch AI authorization on themselves.
 */
export function startingRules(capMinor: number, autoMinor: number): SpendingRules {
  return {
    ruleVersion: "owner-1",
    currency: "USD",
    perPurchaseAutoLimitMinor: autoMinor,
    monthlyCapMinor: capMinor,
    permittedCategories: [...STARTING_CATEGORIES],
    requireApprovalForNewPayee: true,
    autoApproveEnabled: false,
    autoAllowlist: [],
    autoBudgetMinor: 0,
  };
}

/**
 * Parse an amount the owner typed into integer minor units.
 *
 * Accepts "150", "150.00", "150.5", "1,500.25", and an optional leading "$".
 * Returns null for anything that is not a clean positive amount (zero,
 * negative, more than two decimals, or not a number), so the caller can refuse
 * with a plain sentence.
 */
export function parseMoneyToMinor(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, "").replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const [whole, frac = ""] = cleaned.split(".");
  const minor = Number(whole) * 100 + Number(`${frac}00`.slice(0, 2));
  if (!Number.isSafeInteger(minor) || minor <= 0) return null;
  return minor;
}

/**
 * Advance a rule version on save: "owner-1" becomes "owner-2". A version with
 * no trailing number gets "-2" appended. Recorded decisions keep the version
 * they were judged under, so bumping never rewrites history.
 */
export function nextRuleVersion(version: string): string {
  const match = /^(.*?)-(\d+)$/.exec(version.trim());
  if (match) return `${match[1]}-${Number(match[2]) + 1}`;
  return `${version.trim()}-2`;
}

/**
 * The guardrail between the retired auto line and the monthly cap, in plain
 * words. Null when the pair is sensible. Trust mode (16 oct 2026) replaced
 * this line with the exact-price list, so the Rules page no longer collects it
 * and the engine no longer reads it; kept and tested as the ancestor of
 * `trustProblem`, which is the live guardrail.
 */
export function ruleEditProblem(autoMinor: number, capMinor: number): string | null {
  if (autoMinor > capMinor) {
    return "Your auto-approve line cannot sit above your monthly limit.";
  }
  return null;
}

/** The guardrail sentences, exported so the Rules page shows the same words. */
export const TRUST_BUDGET_OVER_CAP =
  "Your auto budget cannot sit above your monthly limit.";
export const TRUST_ITEM_OVER_CAP =
  "A price on your list cannot sit above your monthly limit.";

/**
 * One trust-list row from the Rules form. The seller and purpose come from the
 * catalog (never from form text); only the price is typed. Returns null when
 * the price does not parse, with the same strictness as the monthly limit.
 */
export function buildTrustEntry(
  payee: string,
  purpose: string,
  amountText: string,
): AutoAllowlistEntry | null {
  const amountMinor = parseMoneyToMinor(amountText);
  if (amountMinor === null) return null;
  return { payee, purpose, amountMinor };
}

/**
 * The guardrails between the trust list, the auto budget, and the monthly
 * cap. Null when the set is sensible; otherwise the problem as a stable code
 * (for the redirect) and the plain sentence (for the page), so the sentence
 * exists in exactly one place.
 */
export function trustProblem(
  budgetMinor: number,
  entries: readonly AutoAllowlistEntry[],
  capMinor: number,
): { code: "budget-over-cap" | "item-over-cap"; message: string } | null {
  if (budgetMinor > capMinor) {
    return { code: "budget-over-cap", message: TRUST_BUDGET_OVER_CAP };
  }
  for (const entry of entries) {
    if (entry.amountMinor > capMinor) {
      return { code: "item-over-cap", message: TRUST_ITEM_OVER_CAP };
    }
  }
  return null;
}
