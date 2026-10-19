/**
 * The ask-box outcome map is the owner's guarantee that the box never lies and
 * never stays silent. These tests pin both halves: the front-door reason order
 * (shape, amount, currency, category, mirroring the engine) and the sentence
 * each URL code renders, including the fallbacks when a code is missing.
 */

import { describe, expect, it } from "vitest";

import {
  ASK_DETAILS_TOOL,
  PROPOSE_PURCHASE_TOOL,
  type AgentRunResult,
} from "@/agent";
import { ReasonCode, type SpendingRules } from "@/core/authorization";

import {
  askMessageFor,
  askPathFor,
  frontDoorReason,
  outcomeFromRun,
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
  autoApproveEnabled: false, // product default; the front door never reaches it
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
    const filed = (
      decision: "ALLOW" | "ASK" | "DENY",
      reasonCode: ReasonCode = ReasonCode.WITHIN_LIMITS,
    ): AskOutcome => ({ kind: "filed", decision, reasonCode });
    expect(askPathFor({ kind: "empty" })).toBe("/?ask=empty");
    expect(askPathFor({ kind: "error" })).toBe("/?ask=error");
    expect(askPathFor({ kind: "clarify" })).toBe("/?ask=clarify");
    expect(askPathFor(filed("ALLOW"))).toBe("/?ask=allow");
    // The standing ask keeps its bare code; a trust reason rides along so the
    // gate sentence can name it.
    expect(askPathFor(filed("ASK", ReasonCode.APPROVAL_REQUIRED))).toBe("/?ask=needs");
    expect(askPathFor(filed("ASK", ReasonCode.AUTO_BUDGET_USED))).toBe(
      "/?ask=needs&why=auto-budget-used",
    );
    expect(askPathFor(filed("ASK", ReasonCode.AMOUNT_OFF_TRUST_LIST))).toBe(
      "/?ask=needs&why=amount-off-trust-list",
    );
    expect(askPathFor({ kind: "paid" })).toBe("/?ask=paid");
    expect(askPathFor({ kind: "paid", ref: "CAP-1" })).toBe("/?ask=paid&ref=CAP-1");
    // A shortRef-style display ellipsis must never reach the redirect header
    // raw (x-action-redirect is ASCII): it travels percent-encoded.
    expect(askPathFor({ kind: "paid", ref: "0YK41054…" })).toBe(
      "/?ask=paid&ref=0YK41054%E2%80%A6",
    );
    expect(askPathFor({ kind: "stalled" })).toBe("/?ask=stalled");
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
    expect(reasonFromSlug("on-trust-list")).toBe(ReasonCode.ON_TRUST_LIST);
    expect(reasonFromSlug("not-on-trust-list")).toBe(ReasonCode.NOT_ON_TRUST_LIST);
    expect(reasonFromSlug("amount-off-trust-list")).toBe(
      ReasonCode.AMOUNT_OFF_TRUST_LIST,
    );
    expect(reasonFromSlug("auto-budget-used")).toBe(ReasonCode.AUTO_BUDGET_USED);
    expect(reasonFromSlug("nonsense")).toBeNull();
    expect(reasonFromSlug(undefined)).toBeNull();
  });
});

describe("askMessageFor", () => {
  it("says what happened when something was filed", () => {
    expect(askMessageFor("allow", undefined)?.text).toBe(
      "Added below. Your rules cleared it.",
    );
    expect(askMessageFor("needs", undefined)?.text).toBe(
      "Added below. It needs your okay before any money moves.",
    );
    expect(askMessageFor("blocked", "monthly-cap-exceeded")?.text).toBe(
      "Added below. Your rules blocked it: over monthly limit.",
    );
  });

  it("names the trust-list reason right in the ask sentence", () => {
    expect(askMessageFor("needs", "not-on-trust-list")?.text).toBe(
      "Added below. It needs your okay: not on your list.",
    );
    expect(askMessageFor("needs", "amount-off-trust-list")?.text).toBe(
      "Added below. It needs your okay: price differs from your list.",
    );
    expect(askMessageFor("needs", "auto-budget-used")?.text).toBe(
      "Added below. It needs your okay: auto budget used up.",
    );
    // The standing ask keeps the shipped sentence, not "your okay needed".
    expect(askMessageFor("needs", "approval-required")?.text).toBe(
      "Added below. It needs your okay before any money moves.",
    );
  });

  it("claims a payment only when a capture is real", () => {
    expect(askMessageFor("paid", undefined)?.text).toBe(
      "Your rules cleared this at the exact price on your list, and it is paid.",
    );
    expect(askMessageFor("paid", undefined, "CAP-1")?.text).toBe(
      "Your rules cleared this at the exact price on your list, and it is paid. Reference CAP-1.",
    );
    const stalled = askMessageFor("stalled", undefined);
    expect(stalled?.text).toBe(
      "Your rules cleared it, but the payment did not go through. No money moved.",
    );
    expect(stalled?.error).toBe(true);
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

describe("clarify with named missing facts (19 oct 2026)", () => {
  it("carries the fact codes on the URL, in canonical order", () => {
    expect(askPathFor({ kind: "clarify", missing: ["amount", "payee"] })).toBe(
      "/?ask=clarify&missing=payee,amount",
    );
    expect(askPathFor({ kind: "clarify", missing: [] })).toBe("/?ask=clarify");
    expect(askPathFor({ kind: "clarify" })).toBe("/?ask=clarify");
  });

  it("names exactly what the message lacked", () => {
    expect(askMessageFor("clarify", undefined, undefined, "payee")?.text).toBe(
      "Nothing was added below. Your message didn't say who gets paid. Add that and ask again.",
    );
    expect(askMessageFor("clarify", undefined, undefined, "amount,purpose")?.text).toBe(
      "Nothing was added below. Your message didn't say the price or what it is for. Add both and ask again.",
    );
    expect(
      askMessageFor("clarify", undefined, undefined, "payee,amount,purpose")?.text,
    ).toBe(
      "Nothing was added below. Your message didn't say who gets paid, the price, or what it is for. Add all three and ask again.",
    );
  });

  it("drops codes it does not know and falls back to the generic sentence", () => {
    expect(askMessageFor("clarify", undefined, undefined, "seller,,payee")?.text).toBe(
      "Nothing was added below. Your message didn't say who gets paid. Add that and ask again.",
    );
    expect(askMessageFor("clarify", undefined, undefined, "seller")?.text).toBe(
      "Nothing was added below. Tell it the amount, the seller, what it is for, and what kind of purchase it is (for example software, books, or meals), then ask again.",
    );
  });
});

describe("outcomeFromRun", () => {
  const run = (
    toolCalls: AgentRunResult["toolCalls"],
    toolResults: AgentRunResult["toolResults"],
  ): AgentRunResult => ({ text: "", steps: 1, toolCalls, toolResults });

  it("reports the missing facts when the assistant used ask_for_details", () => {
    const outcome = outcomeFromRun(
      run(
        [{ name: ASK_DETAILS_TOOL, input: { missing: ["payee"] } }],
        [{ name: ASK_DETAILS_TOOL, output: { missing: ["payee"] } }],
      ),
      RULES,
    );
    expect(outcome).toEqual({ kind: "clarify", missing: ["payee"] });
  });

  it("keeps a filed fact stronger than a question", () => {
    const outcome = outcomeFromRun(
      run(
        [
          { name: ASK_DETAILS_TOOL, input: { missing: ["payee"] } },
          { name: PROPOSE_PURCHASE_TOOL, input: INPUT },
        ],
        [
          { name: ASK_DETAILS_TOOL, output: { missing: ["payee"] } },
          {
            name: PROPOSE_PURCHASE_TOOL,
            output: {
              decision: "ASK",
              reasonCode: ReasonCode.APPROVAL_REQUIRED,
              requestId: "req-1",
            },
          },
        ],
      ),
      RULES,
    );
    expect(outcome).toEqual({
      kind: "filed",
      decision: "ASK",
      reasonCode: ReasonCode.APPROVAL_REQUIRED,
      requestId: "req-1",
    });
  });

  it("falls back to the plain clarify on an empty or junk report", () => {
    expect(
      outcomeFromRun(run([], [{ name: ASK_DETAILS_TOOL, output: { missing: [] } }]), RULES),
    ).toEqual({ kind: "clarify" });
    expect(
      outcomeFromRun(
        run([], [{ name: ASK_DETAILS_TOOL, output: { missing: ["seller"] } }]),
        RULES,
      ),
    ).toEqual({ kind: "clarify" });
  });

  it("still reconstructs the front-door reason for a rejected propose call", () => {
    const outcome = outcomeFromRun(
      run([{ name: PROPOSE_PURCHASE_TOOL, input: { ...INPUT, amountMinor: 0 } }], []),
      RULES,
    );
    expect(outcome).toEqual({ kind: "unfiled", reasonCode: ReasonCode.INVALID_AMOUNT });
  });

  it("says clarify when the model called nothing at all", () => {
    expect(outcomeFromRun(run([], []), RULES)).toEqual({ kind: "clarify" });
  });
});
