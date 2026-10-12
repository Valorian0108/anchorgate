/**
 * Rules editing from the Rules page: parse the amount the owner types and
 * advance the rule version on save.
 *
 * The page collects ONE number now (Option 1: auto-approve is off, so there
 * is no auto line to set). The pair guardrail below stays as dormant, tested
 * plumbing for the day trust-based auto returns.
 *
 * Pure and unit-tested. The server action composes these with the durable
 * store; the engine is never involved here (it re-reads the saved rules fresh
 * on the next decision).
 */

import type { SpendingRules } from "@/core/authorization";

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
 * `autoMinor` seeds the dormant auto line; the Rules page collects one number
 * now, so the action passes 0, the safest value it could ever have.
 * Version "owner-1": the first set is not a bump of anything. New sellers
 * always need approval (fail-safe on), and the currency is USD, matching the
 * sandbox the whole product runs on.
 *
 * Option 1 (owner decision): auto-approve starts OFF, so every request inside
 * the cap needs the owner. The auto number is still stored — dormant plumbing
 * for a future trust-based auto mode — but the engine ignores it while the
 * flag is false.
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
 * The guardrail between the auto line and the monthly cap, in plain words.
 * Null when the pair is sensible. Dormant under Option 1 (the Rules page no
 * longer collects an auto line); kept and tested for a future trust-based
 * auto mode. Mirrors the command-line rule setter.
 */
export function ruleEditProblem(autoMinor: number, capMinor: number): string | null {
  if (autoMinor > capMinor) {
    return "Your auto-approve line cannot sit above your monthly limit.";
  }
  return null;
}
