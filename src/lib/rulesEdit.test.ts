/**
 * The Rules editor's pure helpers. These pin the owner-facing contract: what
 * counts as a typed amount, how the rule version advances on save, and the
 * guardrail between the auto line and the cap. Under Option 1 the Rules page
 * collects one number, so the guardrail and the auto argument are dormant
 * plumbing, still tested for the day trust-based auto returns.
 */

import { describe, expect, it } from "vitest";

import {
  nextRuleVersion,
  parseMoneyToMinor,
  ruleEditProblem,
  startingRules,
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

  it("Option 1: starts with auto-approve off, so every request needs the owner", () => {
    expect(startingRules(50000, 5000).autoApproveEnabled).toBe(false);
  });

  it("hands back a fresh category list each time, so saves never share state", () => {
    const a = startingRules(100, 50);
    const b = startingRules(100, 50);
    a.permittedCategories.push("mutated");
    expect(b.permittedCategories).not.toContain("mutated");
  });
});
