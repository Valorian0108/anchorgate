/**
 * The ask-box outcome map is the owner's guarantee that the box never lies and
 * never stays silent. These tests pin both halves: the front-door reason order
 * (shape, amount, currency, category, mirroring the engine) and the sentence
 * each URL code renders, including the fallbacks when a code is missing.
 */

import { describe, expect, it } from "vitest";

import { ReasonCode, type SpendingRules } from "@/core/authorization";

import {
  askMessageFor,
  askPathFor,
  frontDoorReason,
  reasonFromSlug,
  type AskOutcome,
} from "./askOutcome";

const RULES: SpendingRules = {
  ruleVersion: "owner-1",
  currency: "USD",
  perPurchaseAutoLimitMinor: 5000,
  monthlyCapMinor: 10000,
  permittedCategories: ["books", "software"],
  requireApprovalForNewPayee: true,
  autoApproveEnabled: false, // Option 1 default; the front door never reaches it
};

const INPUT = {
  payee: "Book Depository",
  purpose: "a gardening book",
  category: "books",
  amountMinor: 2000,
  currency: "USD",
};

describe("frontDoorReason", () => {
  it("fails safe when there are no rules at all", () => {
    expect(frontDoorReason(INPUT, null)).toBe(ReasonCode.INVALID_RULES);
  });

  it("checks the shape first, in the engine's order", () => {
    expect(frontDoorReason({ ...INPUT, payee: "  " }, RULES)).toBe(
      ReasonCode.INVALID_REQUEST,
    );
    expect(frontDoorReason({ ...INPUT, purpose: "" }, RULES)).toBe(
      ReasonCode.INVALID_REQUEST,
    );
    expect(frontDoorReason({}, RULES)).toBe(ReasonCode.INVALID_REQUEST);
  });

  it("then the amount, then the currency, then the category", () => {
    expect(frontDoorReason({ ...INPUT, amountMinor: 0 }, RULES)).toBe(
      ReasonCode.INVALID_AMOUNT,
    );
    expect(frontDoorReason({ ...INPUT, amountMinor: 12.5 }, RULES)).toBe(
      ReasonCode.INVALID_AMOUNT,
    );
    expect(frontDoorReason({ ...INPUT, amountMinor: 0, currency: "BTC" }, RULES)).toBe(
      ReasonCode.INVALID_AMOUNT,
    );
    expect(frontDoorReason({ ...INPUT, currency: "btc" }, RULES)).toBe(
      ReasonCode.CURRENCY_MISMATCH,
    );
    expect(frontDoorReason({ ...INPUT, category: "crypto" }, RULES)).toBe(
      ReasonCode.CATEGORY_NOT_PERMITTED,
    );
  });

  it("treats an input that passes every front-door check as a plain refusal", () => {
    expect(frontDoorReason(INPUT, RULES)).toBe(ReasonCode.INVALID_REQUEST);
  });
});

describe("askPathFor and reasonFromSlug", () => {
  it("round-trips every outcome through short URL codes", () => {
    const filed = (decision: "ALLOW" | "ASK" | "DENY"): AskOutcome => ({
      kind: "filed",
      decision,
      reasonCode: ReasonCode.WITHIN_LIMITS,
    });
    expect(askPathFor({ kind: "empty" })).toBe("/?ask=empty");
    expect(askPathFor({ kind: "error" })).toBe("/?ask=error");
    expect(askPathFor({ kind: "clarify" })).toBe("/?ask=clarify");
    expect(askPathFor(filed("ALLOW"))).toBe("/?ask=allow");
    expect(askPathFor(filed("ASK"))).toBe("/?ask=needs");
    expect(
      askPathFor({ kind: "filed", decision: "DENY", reasonCode: ReasonCode.MONTHLY_CAP_EXCEEDED }),
    ).toBe("/?ask=blocked&why=monthly-cap-exceeded");
    expect(
      askPathFor({ kind: "unfiled", reasonCode: ReasonCode.CATEGORY_NOT_PERMITTED }),
    ).toBe("/?ask=unfiled&why=category-not-permitted");
  });

  it("reads known slugs back and refuses unknown ones", () => {
    expect(reasonFromSlug("category-not-permitted")).toBe(
      ReasonCode.CATEGORY_NOT_PERMITTED,
    );
    expect(reasonFromSlug("monthly-cap-exceeded")).toBe(
      ReasonCode.MONTHLY_CAP_EXCEEDED,
    );
    expect(reasonFromSlug("nonsense")).toBeNull();
    expect(reasonFromSlug(undefined)).toBeNull();
  });
});

describe("askMessageFor", () => {
  it("says what happened when something was filed", () => {
    expect(askMessageFor("allow", undefined)?.text).toBe(
      "Added below. Your rules cleared it, so it is ready to pay when you press pay.",
    );
    expect(askMessageFor("needs", undefined)?.text).toBe(
      "Added below. It needs your okay before any money moves.",
    );
    expect(askMessageFor("blocked", "monthly-cap-exceeded")?.text).toBe(
      "Added below. Your rules blocked it: over monthly limit.",
    );
  });

  it("says so plainly when nothing was filed, and marks it as a refusal", () => {
    const message = askMessageFor("unfiled", "category-not-permitted");
    expect(message?.text).toBe(
      "I could not file that one: category not allowed. Nothing was added below.",
    );
    expect(message?.error).toBe(true);
  });

  it("falls back to a complete sentence when the why code is missing", () => {
    expect(askMessageFor("blocked", undefined)?.text).toBe(
      "Added below. Your rules blocked it.",
    );
    expect(askMessageFor("unfiled", "nonsense")?.text).toBe(
      "I could not file that one. Nothing was added below.",
    );
  });

  it("covers the empty box, the clarifying question, and the outage", () => {
    expect(askMessageFor("empty", undefined)?.text).toBe(
      "Type what you want looked at first, then ask.",
    );
    expect(askMessageFor("clarify", undefined)?.text).toBe(
      "Nothing was added below. Tell it the amount, the seller, what it is for, and what kind of purchase it is (for example software, books, or meals), then ask again.",
    );
    expect(askMessageFor("error", undefined)?.error).toBe(true);
  });

  it("points at the Rules page, and at one number, when the gate has no rules", () => {
    expect(askMessageFor("norules", undefined)?.text).toContain(
      "Set your monthly limit on the Rules page",
    );
  });

  it("shows nothing at all when there is no outcome code", () => {
    expect(askMessageFor(undefined, undefined)).toBeNull();
    expect(askMessageFor("unknown", undefined)).toBeNull();
  });
});
