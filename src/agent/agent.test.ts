/**
 * AI agent tests (Phase 5).
 *
 * These tests do not call a language model. They prove the properties that must
 * hold regardless of what the model does:
 *   - the agent has exactly one tool and no payment tool;
 *   - that tool delegates to the deterministic engine and persists the request;
 *   - the service fails safe on missing rules and respects the hard cap;
 *   - configuration errors name missing variables but never leak values.
 */

import { describe, expect, it } from "vitest";

import {
  InMemorySpendingRulesStore,
  ReasonCode,
  type SpendingRules,
} from "../core/authorization";
import { InMemoryPurchaseStore, type PurchaseRecord } from "../core/purchases";
import { InMemorySpendingStore } from "../core/spending";
import { AgentConfigError, readAgentConfig, readAgentEndpoint } from "./config";
import { describeRules, ProposalService } from "./proposal";
import { createPurchaseTools, PROPOSE_PURCHASE_TOOL } from "./tools";

const NOW = new Date("2026-10-09T12:00:00.000Z");

const RULES: SpendingRules = {
  ruleVersion: "test-1",
  currency: "USD",
  perPurchaseAutoLimitMinor: 1000, // $10.00 automatic
  monthlyCapMinor: 5000, // $50.00 hard cap
  permittedCategories: ["software", "office"],
  requireApprovalForNewPayee: false,
};

const INPUT = {
  payee: "Acme Software",
  purpose: "A one-year license",
  category: "software",
  amountMinor: 500,
  currency: "USD",
};

function makeService(rules: SpendingRules | null = RULES) {
  const purchases = new InMemoryPurchaseStore();
  const spending = new InMemorySpendingStore();
  let counter = 0;
  const service = new ProposalService({
    rules: new InMemorySpendingRulesStore(rules),
    purchases,
    spending,
    agentId: "test-agent",
    now: () => NOW,
    newId: () => `req-${++counter}`,
  });
  return { service, purchases, spending };
}

describe("ProposalService (deterministic)", () => {
  it("ALLOWs a purchase within the per-purchase limit and cap", async () => {
    const { service, purchases } = makeService();
    const result = await service.propose(INPUT);
    expect(result.decision.decision).toBe("ALLOW");
    expect(result.record?.status).toBe("AUTHORIZED");
    expect(await purchases.getById(result.record!.id)).not.toBeNull();
  });

  it("ASKs when the amount is above the automatic per-purchase limit", async () => {
    const { service } = makeService();
    const result = await service.propose({ ...INPUT, amountMinor: 1500 });
    expect(result.decision.decision).toBe("ASK");
    expect(result.decision.reasonCode).toBe(ReasonCode.PER_PURCHASE_LIMIT_EXCEEDED);
    expect(result.record?.status).toBe("PENDING_APPROVAL");
  });

  it("DENIEs when the purchase would exceed the hard monthly cap", async () => {
    const { service } = makeService();
    const result = await service.propose({ ...INPUT, amountMinor: 6000 });
    expect(result.decision.decision).toBe("DENY");
    expect(result.decision.reasonCode).toBe(ReasonCode.MONTHLY_CAP_EXCEEDED);
  });

  it("DENIEs a category that is not permitted", async () => {
    const { service } = makeService();
    const result = await service.propose({ ...INPUT, category: "gambling" });
    expect(result.decision.decision).toBe("DENY");
    expect(result.decision.reasonCode).toBe(ReasonCode.CATEGORY_NOT_PERMITTED);
  });

  it("DENIEs a zero or negative amount (engine, not the schema)", async () => {
    const { service } = makeService();
    const result = await service.propose({ ...INPUT, amountMinor: 0 });
    expect(result.decision.decision).toBe("DENY");
    expect(result.decision.reasonCode).toBe(ReasonCode.INVALID_AMOUNT);
  });

  it("rejects a malformed request without creating a record", async () => {
    const { service } = makeService();
    const result = await service.propose({ ...INPUT, payee: "" });
    expect(result.decision.decision).toBe("DENY");
    expect(result.decision.reasonCode).toBe(ReasonCode.INVALID_REQUEST);
    expect(result.record).toBeNull();
  });

  it("fails safe when no rules are configured", async () => {
    const { service } = makeService(null);
    const result = await service.propose(INPUT);
    expect(result.decision.decision).toBe("DENY");
    expect(result.decision.reasonCode).toBe(ReasonCode.INVALID_RULES);
  });

  it("counts verified captures toward the monthly budget", async () => {
    const { service, spending } = makeService();
    // A prior verified capture of $50.00 consumes the entire cap.
    await spending.append({
      id: "cap-1",
      requestId: "prior",
      kind: "CAPTURE_VERIFIED",
      amountMinor: 5000,
      currency: "USD",
      occurredAt: NOW.toISOString(),
      providerRef: "CAPTURE-1",
    });
    const result = await service.propose(INPUT);
    expect(result.decision.decision).toBe("DENY");
    expect(result.decision.reasonCode).toBe(ReasonCode.MONTHLY_CAP_EXCEEDED);
  });

  it("requires approval for a first-time payee when configured", async () => {
    const { service } = makeService({ ...RULES, requireApprovalForNewPayee: true });
    const result = await service.propose(INPUT);
    expect(result.decision.decision).toBe("ASK");
    expect(result.decision.reasonCode).toBe(ReasonCode.APPROVAL_REQUIRED);
  });

  it("treats a previously approved payee as known", async () => {
    const { service, purchases } = makeService({
      ...RULES,
      requireApprovalForNewPayee: true,
    });
    const prior: PurchaseRecord = {
      id: "prior-1",
      request: {
        id: "prior-1",
        agentId: "test-agent",
        payee: INPUT.payee,
        purpose: "earlier purchase",
        category: "software",
        amountMinor: 100,
        currency: "USD",
      },
      fingerprint: "not-inspected-by-this-test",
      status: "APPROVED",
      createdAt: NOW.toISOString(),
      evaluations: [],
    };
    await purchases.save(prior);

    const result = await service.propose(INPUT);
    expect(result.decision.decision).toBe("ALLOW");
  });

  it("records an informational PROPOSED event", async () => {
    const { service, spending } = makeService();
    const result = await service.propose(INPUT);
    const events = await spending.listByRequest(result.record!.id);
    expect(events.map((event) => event.kind)).toContain("PROPOSED");
  });
});

describe("agent tool set", () => {
  it("exposes exactly one tool, propose_purchase, and no payment tool", () => {
    const { service } = makeService();
    const tools = createPurchaseTools(service);
    const names = Object.keys(tools);
    expect(names).toEqual([PROPOSE_PURCHASE_TOOL]);
    for (const name of names) {
      expect(name).not.toMatch(/pay|capture|refund|execute|approve|transfer/i);
    }
  });

  it("returns the engine's decision and persists the request", async () => {
    const { service, purchases } = makeService();
    const tools = createPurchaseTools(service);
    const result = (await tools[PROPOSE_PURCHASE_TOOL].execute!(INPUT, {
      toolCallId: "call-1",
      messages: [],
      context: {},
    })) as { decision: string; requestId: string; decidedBy: string };

    expect(result.decision).toBe("ALLOW");
    expect(await purchases.getById(result.requestId)).not.toBeNull();
    expect(result.decidedBy).toContain("deterministic");
  });
});

describe("agent configuration", () => {
  it("defaults the base URL and agent id", () => {
    const config = readAgentConfig({
      AGENT_API_KEY: "placeholder-key",
      AGENT_MODEL: "some-model",
    });
    expect(config.baseUrl).toBe("https://api.experientiallabs.ai/v1");
    expect(config.agentId).toBe("ai-agent");
  });

  it("names missing variables without leaking values", () => {
    try {
      readAgentConfig({ AGENT_API_KEY: "super-secret-value" });
      throw new Error("expected readAgentConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentConfigError);
      const message = (error as Error).message;
      expect(message).toContain("AGENT_MODEL");
      expect(message).not.toContain("super-secret-value");
    }
  });

  it("requires an API key", () => {
    expect(() => readAgentEndpoint({})).toThrow(AgentConfigError);
  });
});

describe("describeRules", () => {
  it("lists the permitted categories and the hard cap", () => {
    const text = describeRules(RULES);
    expect(text).toContain("software");
    expect(text).toContain("office");
    expect(text).toContain("NEVER override");
  });

  it("says nothing can be authorized when there are no rules", () => {
    expect(describeRules(null)).toContain("No spending rules");
  });
});
