/**
 * Authorization core tests.
 *
 * Mapped to the acceptance criteria in the project spec (section 11.1). These
 * tests run against the real engine — not a mock — because the engine is pure.
 *
 * Trust mode (owner decision, 16 oct 2026): AI authorization ships OFF, so the
 * product-default fixture (BASE_RULES) asks for everything inside the cap. When
 * the owner switches it on, their exact-price trust list is the ONE automatic
 * path (TRUST_RULES): exact match inside the auto budget allows, anything
 * else asks, and the hard rules still beat the list.
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

/** The product default: AI authorization OFF. Everything needs the owner. */
const BASE_RULES: SpendingRules = {
  ruleVersion: "v1",
  currency: "USD",
  perPurchaseAutoLimitMinor: 1000, // retired: the engine no longer reads this line
  monthlyCapMinor: 5000, // $50.00
  permittedCategories: ["office", "books", "software"],
  requireApprovalForNewPayee: false,
  autoApproveEnabled: false,
};

/**
 * Trust mode, exercised: AI authorization on with one exact-price entry and a
 * $20.00 auto budget under the $50.00 cap. The default request below is an
 * exact match for the entry.
 */
const TRUST_RULES: SpendingRules = {
  ...BASE_RULES,
  autoApproveEnabled: true,
  autoAllowlist: [
    { payee: "Acme Supplies", purpose: "Office supplies", amountMinor: 500 },
  ],
  autoBudgetMinor: 2000,
};

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

// --- AI authorization off: every request needs the owner ---------------------

describe("AI authorization off (the product default)", () => {
  it("asks for a small amount", () => {
    const result = evaluatePurchase(request(), BASE_RULES, BASE_STATE);
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.APPROVAL_REQUIRED);
    expect(result.ruleVersion).toBe("v1");
  });

  it("asks even when the purchase would exactly match a trust list entry", () => {
    // The list means nothing while the toggle is off: the flag is checked
    // before the list is ever read.
    const result = evaluatePurchase(request(), { ...TRUST_RULES, autoApproveEnabled: false }, BASE_STATE);
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

  it("still denies over the cap: the toggle never softens a hard stop", () => {
    const result = evaluatePurchase(
      request({ amountMinor: 6000 }),
      BASE_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.MONTHLY_CAP_EXCEEDED);
  });

  it("treats rules that omit the flag (saved before trust mode) as off", () => {
    const { autoApproveEnabled: _omit, ...legacyRules } = BASE_RULES;
    const result = evaluatePurchase(request(), legacyRules, BASE_STATE);
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.APPROVAL_REQUIRED);
  });
});

// --- Trust mode: the exact-price list is the only automatic path --------------

describe("trust mode — the trust list decides", () => {
  it("allows an exact match on the list, inside the auto budget", () => {
    const result = evaluatePurchase(request(), TRUST_RULES, BASE_STATE);
    expect(result.decision).toBe("ALLOW");
    expect(result.reasonCode).toBe(ReasonCode.ON_TRUST_LIST);
    expect(result.ruleVersion).toBe("v1");
  });

  it("asks when the amount differs from the listed price, quoting both numbers", () => {
    const result = evaluatePurchase(
      request({ amountMinor: 501 }),
      TRUST_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.AMOUNT_OFF_TRUST_LIST);
    expect(result.reason).toContain("501");
    expect(result.reason).toContain("500");
  });

  it("asks when the payee is not on the list", () => {
    const result = evaluatePurchase(
      request({ payee: "Brand New Shop" }),
      TRUST_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.NOT_ON_TRUST_LIST);
  });

  it("asks when the purpose differs, even with the payee on the list", () => {
    const result = evaluatePurchase(
      request({ purpose: "Party snacks" }),
      TRUST_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.NOT_ON_TRUST_LIST);
  });

  it("asks for everything when the list is empty", () => {
    const result = evaluatePurchase(
      request(),
      { ...TRUST_RULES, autoAllowlist: [] },
      BASE_STATE,
    );
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.NOT_ON_TRUST_LIST);
  });

  it("treats a missing list (rules saved before trust mode) as empty", () => {
    const { autoAllowlist: _omit, ...legacyAuto } = TRUST_RULES;
    const result = evaluatePurchase(request(), legacyAuto, BASE_STATE);
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.NOT_ON_TRUST_LIST);
  });

  it("ignores the retired per-purchase line: an exact match above it still allows", () => {
    const result = evaluatePurchase(
      request({ amountMinor: 1500 }),
      {
        ...TRUST_RULES,
        autoAllowlist: [
          { payee: "Acme Supplies", purpose: "Office supplies", amountMinor: 1500 },
        ],
      },
      BASE_STATE,
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.reasonCode).toBe(ReasonCode.ON_TRUST_LIST);
  });

  it("ignores the retired new-payee flag: the list defines trust", () => {
    const result = evaluatePurchase(
      request(),
      { ...TRUST_RULES, requireApprovalForNewPayee: true },
      BASE_STATE, // "Acme Supplies" is NOT a known payee here
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.reasonCode).toBe(ReasonCode.ON_TRUST_LIST);
  });

  it("denies when the list is malformed, rather than loosening", () => {
    const result = evaluatePurchase(
      request(),
      {
        ...TRUST_RULES,
        autoAllowlist: [{ payee: "Acme Supplies" }] as never,
      },
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.INVALID_RULES);
  });
});

// --- Trust mode: the auto budget is a second ceiling under the cap ------------

describe("trust mode — the auto budget", () => {
  it("asks when the auto spending would pass the auto budget", () => {
    const result = evaluatePurchase(request(), TRUST_RULES, {
      spentThisMonthMinor: 1600,
      knownPayees: [],
      autoSpentThisMonthMinor: 1600,
    });
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.AUTO_BUDGET_USED);
  });

  it("allows a purchase that lands exactly on the auto budget", () => {
    const result = evaluatePurchase(request(), TRUST_RULES, {
      spentThisMonthMinor: 1500,
      knownPayees: [],
      autoSpentThisMonthMinor: 1500,
    });
    expect(result.decision).toBe("ALLOW");
    expect(result.reasonCode).toBe(ReasonCode.ON_TRUST_LIST);
  });

  it("never auto-pays with a zero auto budget", () => {
    const result = evaluatePurchase(
      request(),
      { ...TRUST_RULES, autoBudgetMinor: 0 },
      BASE_STATE,
    );
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.AUTO_BUDGET_USED);
  });

  it("treats a missing auto budget as zero", () => {
    const { autoBudgetMinor: _omit, ...noBudget } = TRUST_RULES;
    const result = evaluatePurchase(request(), noBudget, BASE_STATE);
    expect(result.decision).toBe("ASK");
    expect(result.reasonCode).toBe(ReasonCode.AUTO_BUDGET_USED);
  });

  it("counts only the auto figure against the budget, not all spending", () => {
    // $40 of human-approved spending this month, $0 of it automatic: the auto
    // budget is untouched, and the purchase still fits under the $50 cap.
    const result = evaluatePurchase(request(), TRUST_RULES, {
      spentThisMonthMinor: 4000,
      knownPayees: [],
      autoSpentThisMonthMinor: 0,
    });
    expect(result.decision).toBe("ALLOW");
    expect(result.reasonCode).toBe(ReasonCode.ON_TRUST_LIST);
  });
});

// --- Trust mode: hard rules still beat the list -------------------------------

describe("trust mode — hard rules beat the list", () => {
  it("denies an exact match that would exceed the monthly cap", () => {
    const result = evaluatePurchase(request(), TRUST_RULES, {
      spentThisMonthMinor: 4600,
      knownPayees: [],
      autoSpentThisMonthMinor: 0,
    });
    // ($46.00 spent + $5.00 = $51.00 > $50.00 cap)
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.MONTHLY_CAP_EXCEEDED);
  });

  it("denies an exact match in an unpermitted category", () => {
    const result = evaluatePurchase(
      request({ category: "gambling" }),
      TRUST_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.CATEGORY_NOT_PERMITTED);
  });

  it("denies an exact match in the wrong currency", () => {
    const result = evaluatePurchase(
      request({ currency: "EUR" }),
      TRUST_RULES,
      BASE_STATE,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasonCode).toBe(ReasonCode.CURRENCY_MISMATCH);
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
