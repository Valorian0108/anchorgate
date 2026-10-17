/**
 * Rules parsing at the trust-mode boundary: where stored rules become engine
 * input.
 *
 * The trust fields are optional on purpose (migration 0006 is additive, and
 * rule sets saved before trust mode do not carry them). Missing fields
 * normalize to the safe direction: an empty list matches nothing, a zero
 * budget auto-pays nothing. Malformed trust data fails the WHOLE parse, which
 * denies everything downstream, rather than silently loosening.
 */

import { describe, expect, it } from "vitest";

import { parseRules } from "./validation";

/** A complete pre-trust-mode rule set: every legacy field, no trust fields. */
const BASE = {
  ruleVersion: "owner-1",
  currency: "USD",
  perPurchaseAutoLimitMinor: 0,
  monthlyCapMinor: 5000,
  permittedCategories: ["books"],
  requireApprovalForNewPayee: true,
};

describe("parseRules trust fields", () => {
  it("normalizes rules saved before trust mode: empty list, zero budget, flag off", () => {
    const result = parseRules(BASE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.autoAllowlist).toEqual([]);
    expect(result.value.autoBudgetMinor).toBe(0);
    expect(result.value.autoApproveEnabled).toBe(false);
  });

  it("round-trips a full trust configuration", () => {
    const result = parseRules({
      ...BASE,
      autoApproveEnabled: true,
      autoAllowlist: [{ payee: "Acme", purpose: "Supplies", amountMinor: 500 }],
      autoBudgetMinor: 2000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.autoApproveEnabled).toBe(true);
    expect(result.value.autoAllowlist).toEqual([
      { payee: "Acme", purpose: "Supplies", amountMinor: 500 },
    ]);
    expect(result.value.autoBudgetMinor).toBe(2000);
  });

  it("fails the whole parse on a malformed entry, rather than dropping it", () => {
    // A partial entry could never match safely, and silently dropping it would
    // hide a mistake: the parse fails, so the engine denies everything.
    expect(parseRules({ ...BASE, autoAllowlist: [{ payee: "Acme" }] }).ok).toBe(false);
    expect(
      parseRules({
        ...BASE,
        autoAllowlist: [{ payee: "Acme", purpose: "Supplies", amountMinor: 0 }],
      }).ok,
    ).toBe(false);
    expect(
      parseRules({
        ...BASE,
        autoAllowlist: [{ payee: "Acme", purpose: "Supplies", amountMinor: 5.5 }],
      }).ok,
    ).toBe(false);
    expect(parseRules({ ...BASE, autoAllowlist: "nope" }).ok).toBe(false);
  });

  it("refuses a negative budget and accepts zero", () => {
    expect(parseRules({ ...BASE, autoBudgetMinor: -1 }).ok).toBe(false);
    const zero = parseRules({ ...BASE, autoBudgetMinor: 0 });
    expect(zero.ok).toBe(true);
    if (zero.ok) expect(zero.value.autoBudgetMinor).toBe(0);
  });
});
