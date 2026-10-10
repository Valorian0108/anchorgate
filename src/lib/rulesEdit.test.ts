/**
 * The Rules editor's pure helpers. These pin the owner-facing contract: what
 * counts as a typed amount, how the rule version advances on save, and the one
 * guardrail between the two numbers.
 */

import { describe, expect, it } from "vitest";

import { nextRuleVersion, parseMoneyToMinor, ruleEditProblem } from "./rulesEdit";

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
