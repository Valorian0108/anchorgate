/**
 * Rules editing from the Rules page: parse the two amounts the owner types and
 * advance the rule version on save.
 *
 * Pure and unit-tested. The server action composes these with the durable
 * store; the engine is never involved here (it re-reads the saved rules fresh
 * on the next decision).
 */

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
 * The one guardrail between the two numbers, in plain words. Null when the
 * pair is sensible. Mirrors the command-line rule setter.
 */
export function ruleEditProblem(autoMinor: number, capMinor: number): string | null {
  if (autoMinor > capMinor) {
    return "Your auto-approve line cannot sit above your monthly limit.";
  }
  return null;
}
