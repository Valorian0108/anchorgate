import { describe, expect, it } from "vitest";

import { CATALOG_AGENT_ID } from "@/agent/catalog";
import { ReasonCode } from "@/core/authorization";
import type { PurchaseRecord, RequestStatus } from "@/core/purchases";
import { currencySymbol, gateCardStatus, sourcePhrase } from "@/lib/gateCard";

function makeRecord(
  status: RequestStatus,
  reasonCode: ReasonCode = ReasonCode.APPROVAL_REQUIRED,
  agentId = "ai-agent",
): PurchaseRecord {
  return {
    id: "req-1",
    request: {
      id: "req-1",
      agentId,
      payee: "Book Depository",
      purpose: "a gardening book",
      category: "books",
      amountMinor: 2000,
      currency: "USD",
    },
    fingerprint: "abc",
    status,
    createdAt: "2026-10-12T12:00:00.000Z",
    evaluations: [
      {
        context: "PROPOSAL",
        decision: {
          decision: status === "DENIED" ? "DENY" : "ASK",
          reasonCode,
          reason: "test fixture",
          ruleVersion: "owner-1",
        },
        evaluatedAt: "2026-10-12T12:00:00.000Z",
      },
    ],
  };
}

describe("gateCardStatus", () => {
  it("shows a waiting request as needing the owner, with no stamp", () => {
    const status = gateCardStatus(makeRecord("PENDING_APPROVAL"));
    expect(status.kind).toBe("needs-you");
    expect(status.tone).toBe("ask");
    expect(status.stamp).toBeUndefined();
  });

  it("stamps only a verified capture as paid", () => {
    const status = gateCardStatus(makeRecord("EXECUTED"));
    expect(status.kind).toBe("paid");
    expect(status.stamp).toEqual({ text: "Paid", tone: "allow" });
    expect(status.receipt).toContain("paid");
  });

  it("keeps an approval that has not captured yet out of the paid stamp", () => {
    const status = gateCardStatus(makeRecord("APPROVED"));
    expect(status.kind).toBe("paying");
    expect(status.stamp).toBeUndefined();
  });

  it("reads a refused request as blocked, in plain words, with no money moved", () => {
    const status = gateCardStatus(makeRecord("DENIED", ReasonCode.MONTHLY_CAP_EXCEEDED));
    expect(status.kind).toBe("blocked");
    expect(status.stamp).toEqual({ text: "Blocked", tone: "deny" });
    expect(status.receipt).toBe("over monthly limit · no money moved");
    // No raw reason code ever reaches the screen.
    expect(status.receipt).not.toContain("MONTHLY_CAP_EXCEEDED");
  });

  it("reads the owner's own refusal distinctly from a rule refusal", () => {
    const status = gateCardStatus(makeRecord("REJECTED"));
    expect(status.kind).toBe("declined");
    expect(status.mark).toBe("You said no");
  });
});

describe("sourcePhrase", () => {
  it("says the agent brought catalog items, and that the owner asked for the rest", () => {
    expect(sourcePhrase(CATALOG_AGENT_ID)).toBe("brought by your agent");
    expect(sourcePhrase("ai-agent")).toBe("you asked for this");
  });
});

describe("currencySymbol", () => {
  it("uses a symbol for USD and the code for anything else", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("EUR")).toBe("EUR ");
  });
});
