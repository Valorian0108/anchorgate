/**
 * The Rules editor's pure helpers. These pin the owner-facing contract: what
 * counts as a typed amount, how the rule version advances on save, and the
 * guardrails between the trust list, the auto budget, and the monthly cap.
 * The Rules page collects the monthly limit and, under trust mode (owner
 * decision, 16 oct 2026), the AI authorization section; every guardrail
 * sentence lives here once, so the page and the redirect can never disagree.
 */

import { describe, expect, it } from "vitest";

import {
  buildTrustEntry,
  nextRuleVersion,
  parseMoneyToMinor,
  ruleEditProblem,
  startingRules,
  TRUST_BUDGET_OVER_CAP,
  TRUST_ITEM_OVER_CAP,
  trustProblem,
} from "./rulesEdit";

describe("parseMoneyToMinor", () => {
  it("reads whole and decimal amounts into minor units", () => {
    expect(parseMoneyToMinor("150")).toBe(15000);
    expect(parseMoneyToMinor("150.00")).toBe(15000);
    expect(parseMoneyToMinor("150.5")).toBe(15050);
    expect(parseMoneyToMinor("0.50")).toBe(50);
  });

  it("tolerates commas, a leading dollar sign, and surrounding spaces", () => {
    expect(parseMoneyToMinor("1,500.25")).toBe(150025);
    expect(parseMoneyToMinor("$150")).toBe(15000);
    expect(parseMoneyToMinor("  150  ")).toBe(15000);
  });

  it("refuses anything that is not a clean positive amount", () => {
    expect(parseMoneyToMinor("0")).toBeNull();
    expect(parseMoneyToMinor("-5")).toBeNull();
    expect(parseMoneyToMinor("abc")).toBeNull();
    expect(parseMoneyToMinor("1.234")).toBeNull();
    expect(parseMoneyToMinor("")).toBeNull();
    expect(parseMoneyToMinor("12.3.4")).toBeNull();
  });
});

describe("nextRuleVersion", () => {
  it("bumps the trailing number", () => {
    expect(nextRuleVersion("owner-1")).toBe("owner-2");
    expect(nextRuleVersion("owner-9")).toBe("owner-10");
  });

  it("appends -2 when there is no trailing number", () => {
    expect(nextRuleVersion("owner")).toBe("owner-2");
  });
});

describe("ruleEditProblem", () => {
  it("refuses an auto line above the monthly limit, in plain words", () => {
    expect(ruleEditProblem(15000, 10000)).toBe(
      "Your auto-approve line cannot sit above your monthly limit.",
    );
  });

  it("allows an auto line at or under the limit", () => {
    expect(ruleEditProblem(10000, 10000)).toBeNull();
    expect(ruleEditProblem(5000, 10000)).toBeNull();
  });
});

describe("startingRules", () => {
  it("writes a first set from the two numbers, starting at owner-1", () => {
    const rules = startingRules(50000, 5000);
    expect(rules.ruleVersion).toBe("owner-1");
    expect(rules.monthlyCapMinor).toBe(50000);
    expect(rules.perPurchaseAutoLimitMinor).toBe(5000);
    expect(rules.currency).toBe("USD");
  });

  it("fails safe: the standard categories, and new sellers always ask", () => {
    const rules = startingRules(50000, 5000);
    expect(rules.permittedCategories.length).toBe(8);
    expect(rules.requireApprovalForNewPayee).toBe(true);
  });

  it("starts with AI authorization off, an empty list, and a zero budget", () => {
    const rules = startingRules(50000, 5000);
    expect(rules.autoApproveEnabled).toBe(false);
    expect(rules.autoAllowlist).toEqual([]);
    expect(rules.autoBudgetMinor).toBe(0);
  });

  it("hands back a fresh category list each time, so saves never share state", () => {
    const a = startingRules(100, 50);
    const b = startingRules(100, 50);
    a.permittedCategories.push("mutated");
    expect(b.permittedCategories).not.toContain("mutated");
  });
});

describe("buildTrustEntry", () => {
  it("builds an entry from a catalog identity and a typed price", () => {
    expect(buildTrustEntry("Acme Supplies", "Office supplies", "12.50")).toEqual({
      payee: "Acme Supplies",
      purpose: "Office supplies",
      amountMinor: 1250,
    });
  });

  it("refuses a price that does not parse, with the same strictness as the cap", () => {
    expect(buildTrustEntry("Acme Supplies", "Office supplies", "abc")).toBeNull();
    expect(buildTrustEntry("Acme Supplies", "Office supplies", "0")).toBeNull();
    expect(buildTrustEntry("Acme Supplies", "Office supplies", "-3")).toBeNull();
    expect(buildTrustEntry("Acme Supplies", "Office supplies", "1.234")).toBeNull();
  });
});

describe("trustProblem", () => {
  const ENTRY = { payee: "Acme Supplies", purpose: "Office supplies", amountMinor: 500 };

  it("accepts a budget and prices at or under the monthly cap", () => {
    expect(trustProblem(1000, [ENTRY], 5000)).toBeNull();
    expect(trustProblem(5000, [{ ...ENTRY, amountMinor: 5000 }], 5000)).toBeNull();
    expect(trustProblem(0, [], 5000)).toBeNull();
  });

  it("refuses a budget above the cap, with the pinned sentence and code", () => {
    const problem = trustProblem(5001, [], 5000);
    expect(problem?.code).toBe("budget-over-cap");
    expect(problem?.message).toBe(TRUST_BUDGET_OVER_CAP);
  });

  it("refuses a listed price above the cap", () => {
    const problem = trustProblem(0, [{ ...ENTRY, amountMinor: 5001 }], 5000);
    expect(problem?.code).toBe("item-over-cap");
    expect(problem?.message).toBe(TRUST_ITEM_OVER_CAP);
  });

  it("checks the budget first when both numbers are over the cap", () => {
    const problem = trustProblem(6000, [{ ...ENTRY, amountMinor: 7000 }], 5000);
    expect(problem?.code).toBe("budget-over-cap");
  });
});
