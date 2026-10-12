/**
 * Authorization core tests.
 *
 * Mapped to the acceptance criteria in the project spec (section 11.1). These
 * tests run against the real engine — not a mock — because the engine is pure.
 *
 * Option 1 (owner decision): auto-approve ships OFF, so the product-default
 * fixture (BASE_RULES) asks for everything inside the cap. The dormant
 * auto-approve plumbing stays covered through AUTO_RULES, so a future
 * trust-based mode cannot rot untested.
 */

import { describe, expect, it } from "vitest";

import { evaluatePurchase } from "./engine";
import {
  type PurchaseRequest,
  ReasonCode,
  type SpendingRules,
  type SpendingState,
} from "./types";

// --- fixtures ---------------------------------------------------------------

/** The product default: auto-approve OFF (Option 1). Everything needs the owner. */
const BASE_RULES: SpendingRules = {
  ruleVersion: "v1",
  currency: "USD",
  perPurchaseAutoLimitMinor: 1000, // $10.00 (dormant while auto-approve is off)
  monthlyCapMinor: 5000, // $50.00
  permittedCategories: ["office", "books", "software"],
  requireApprovalForNewPayee: false,
  autoApproveEnabled: false,
};

/** The dormant plumbing, exercised: what trust-based auto would switch on. */
const AUTO_RULES: SpendingRules = { ...BASE_RULES, autoApproveEnabled: true };

const BASE_STATE: SpendingState = {
  spentThisMonthMinor: 0,
  knownPayees: [],
};

function request(overrides: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id: "req-1",
    agentId: "agent-1",
    payee: "Acme Supplies",
    purpose: "Office supplies",
    category: "office",
    amountMinor: 500, // $5.00
    currency: "USD",
    ...overrides,
  };
}

// --- Option 1: every request needs the owner --------------------------------

describe("Option 1 — auto-approve off (the product default)", () => {
  it("asks for a small amount far under the per-purchase auto line", () => {
    const result = evaluatePurchase(request(), BASE_RULES, BASE_STATE);
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.APPROVAL_REQUIRED);
    expect(result.ruleVersion).toBe("v1");
  });

  it("asks for an amount exactly at the dormant auto line", () => {
    const result = evaluatePurchase(
      request({ amountMinor: 1000 }),
      BASE_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.APPROVAL_REQUIRED);
  });

  it("asks even when the payee is known and new-payee approval is required", () => {
    const result = evaluatePurchase(
      request(),
      { ...BASE_RULES, requireApprovalForNewPayee: true },
      { spentThisMonthMinor: 0, knownPayees: ["Acme Supplies"] },
    );
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.APPROVAL_REQUIRED);
  });

  it("still denies over the cap: Option 1 never softens a hard stop", () => {
    const result = evaluatePurchase(
      request({ amountMinor: 6000 }),
      BASE_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.MONTHLY_CAP_EXCEEDED);
  });

  it("treats rules that omit the flag (saved before Option 1) as off", () => {
    const { autoApproveEnabled: _omit, ...legacyRules } = BASE_RULES;
    const result = evaluatePurchase(request(), legacyRules, BASE_STATE);
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.APPROVAL_REQUIRED);
  });
});

// --- ALLOW (dormant plumbing: auto-approve explicitly on) --------------------

describe("ALLOW — only with auto-approve enabled", () => {
  it("allows a valid amount within the per-purchase limit and budget", () => {
    const result = evaluatePurchase(request(), AUTO_RULES, BASE_STATE);
    expect(result.decision).toBe("ALLOW");
    expect(result.reasonCode).toBe(ReasonCode.WITHIN_LIMITS);
    expect(result.ruleVersion).toBe("v1");
  });

  it("allows an amount exactly at the per-purchase limit", () => {
    const result = evaluatePurchase(
      request({ amountMinor: 1000 }),
      AUTO_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("ALLOW");
  });

  it("allows a purchase that lands exactly on the monthly cap", () => {
    const result = evaluatePurchase(
      request({ amountMinor: 500 }),
      AUTO_RULES,
      { spentThisMonthMinor: 4500, knownPayees: [] },
    );
    expect(result.decision).toBe("ALLOW");
  });
});

// --- ASK --------------------------------------------------------------------

describe("ASK", () => {
  it("asks when the amount exceeds the per-purchase limit but is within the cap", () => {
    const result = evaluatePurchase(
      request({ amountMinor: 1500 }),
      AUTO_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.PER_PURCHASE_LIMIT_EXCEEDED);
  });

  it("asks for an unseen payee when approval for new payees is required", () => {
    const result = evaluatePurchase(
      request({ payee: "Brand New Shop" }),
      { ...AUTO_RULES, requireApprovalForNewPayee: true },
      BASE_STATE,
    );
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.APPROVAL_REQUIRED);
  });

  it("allows a known payee when approval for new payees is required", () => {
    const result = evaluatePurchase(
      request({ payee: "Acme Supplies" }),
      { ...AUTO_RULES, requireApprovalForNewPayee: true },
      { spentThisMonthMinor: 0, knownPayees: ["Acme Supplies"] },
    );
    expect(result.decision).toBe("ALLOW");
  });
});

// --- DENY: amounts ----------------------------------------------------------

describe("DENY — amounts", () => {
  it("denies a zero amount", () => {
    const result = evaluatePurchase(
      request({ amountMinor: 0 }),
      BASE_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.INVALID_AMOUNT);
  });

  it("denies a negative amount", () => {
    const result = evaluatePurchase(
      request({ amountMinor: -500 }),
      BASE_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.INVALID_AMOUNT);
  });

  it("denies a non-integer amount as a malformed request", () => {
    const result = evaluatePurchase(
      request({ amountMinor: 12.5 }),
      BASE_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.INVALID_REQUEST);
  });
});

// --- DENY: monthly cap (hard) ----------------------------------------------

describe("DENY — monthly cap is hard", () => {
  it("denies a purchase that would exceed the monthly cap", () => {
    const result = evaluatePurchase(
      request({ amountMinor: 6000 }),
      BASE_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.MONTHLY_CAP_EXCEEDED);
  });

  it("denies (not asks) when the cap is exceeded even though the amount is also above the per-purchase limit", () => {
    // Strictest answer wins: over-cap DENY beats over-limit ASK.
    const result = evaluatePurchase(
      request({ amountMinor: 1500 }),
      BASE_RULES,
      { spentThisMonthMinor: 4900, knownPayees: [] },
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.MONTHLY_CAP_EXCEEDED);
  });

  it("denies the cent that tips the total over the cap", () => {
    const result = evaluatePurchase(
      request({ amountMinor: 501 }),
      BASE_RULES,
      { spentThisMonthMinor: 4500, knownPayees: [] },
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.MONTHLY_CAP_EXCEEDED);
  });
});

// --- DENY: categories -------------------------------------------------------

describe("DENY — categories", () => {
  it("denies a category that is not permitted", () => {
    const result = evaluatePurchase(
      request({ category: "gambling" }),
      BASE_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.CATEGORY_NOT_PERMITTED);
  });

  it("denies an unknown category", () => {
    const result = evaluatePurchase(
      request({ category: "mystery" }),
      BASE_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.CATEGORY_NOT_PERMITTED);
  });

  it("denies every category when the permitted list is empty", () => {
    const result = evaluatePurchase(
      request(),
      { ...BASE_RULES, permittedCategories: [] },
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.CATEGORY_NOT_PERMITTED);
  });

  it("denies a request with a missing category as malformed", () => {
    const { category: _omit, ...withoutCategory } = request();
    const result = evaluatePurchase(withoutCategory, BASE_RULES, BASE_STATE);
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.INVALID_REQUEST);
  });
});

// --- DENY: currency ---------------------------------------------------------

describe("DENY — currency", () => {
  it("denies a request whose currency differs from the rules", () => {
    const result = evaluatePurchase(
      request({ currency: "EUR" }),
      BASE_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.CURRENCY_MISMATCH);
  });
});

// --- Fail safe: malformed input --------------------------------------------

describe("fail safe — malformed input", () => {
  it("denies a null request", () => {
    const result = evaluatePurchase(null, BASE_RULES, BASE_STATE);
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.INVALID_REQUEST);
  });

  it("denies a request missing required fields", () => {
    const result = evaluatePurchase({ amountMinor: 500 }, BASE_RULES, BASE_STATE);
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.INVALID_REQUEST);
  });

  it("denies when the rules are missing, and still reports an unknown rule version", () => {
    const result = evaluatePurchase(request(), undefined, BASE_STATE);
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.INVALID_RULES);
    expect(result.ruleVersion).toBe("unknown");
  });

  it("denies when the rules are malformed (negative cap)", () => {
    const result = evaluatePurchase(
      request(),
      { ...BASE_RULES, monthlyCapMinor: -1 },
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.INVALID_RULES);
  });

  it("denies when the spending state cannot be read", () => {
    const result = evaluatePurchase(request(), BASE_RULES, {
      spentThisMonthMinor: "lots",
    });
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.INVALID_STATE);
  });
});

// --- Determinism ------------------------------------------------------------

describe("determinism", () => {
  it("returns an identical decision for identical inputs", () => {
    const first = evaluatePurchase(request(), BASE_RULES, BASE_STATE);
    const second = evaluatePurchase(request(), BASE_RULES, BASE_STATE);
    expect(second).toEqual(first);
  });
});
