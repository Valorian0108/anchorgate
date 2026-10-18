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
import { InMemoryPurchaseStore } from "../core/purchases";
import { InMemorySpendingStore } from "../core/spending";
import { AgentConfigError, readAgentConfig, readAgentEndpoint } from "./config";
import { describeRules, ProposalService } from "./proposal";
import { createPurchaseTools, PROPOSE_PURCHASE_TOOL } from "./tools";

const NOW = new Date("2026-10-09T12:00:00.000Z");

/** The product default: AI authorization OFF — every proposal needs the owner. */
const RULES: SpendingRules = {
  ruleVersion: "test-1",
  currency: "USD",
  perPurchaseAutoLimitMinor: 1000, // retired: the engine no longer reads this line
  monthlyCapMinor: 5000, // $50.00 hard cap
  permittedCategories: ["software", "office"],
  requireApprovalForNewPayee: false,
  autoApproveEnabled: false,
};

const INPUT = {
  payee: "Acme Software",
  purpose: "A one-year license",
  category: "software",
  amountMinor: 500,
  currency: "USD",
};

/** Trust mode exercised: AI authorization ON with one exact-price entry. */
const TRUST_RULES: SpendingRules = {
  ...RULES,
  autoApproveEnabled: true,
  autoAllowlist: [
    { payee: INPUT.payee, purpose: INPUT.purpose, amountMinor: INPUT.amountMinor },
  ],
  autoBudgetMinor: 2000,
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
  it("with AI authorization off, ASKs the owner for every proposal, even a small one", async () => {
    const { service, purchases } = makeService();
    const result = await service.propose(INPUT);
    expect(result.decision.decision).toBe("ASK");
    expect(result.decision.reasonCode).toBe(ReasonCode.APPROVAL_REQUIRED);
    expect(result.record?.status).toBe("PENDING_APPROVAL");
    expect(await purchases.getById(result.record!.id)).not.toBeNull();
  });

  it("ALLOWs an exact trust-list match and files it AUTHORIZED (AI authorization on)", async () => {
    const { service } = makeService(TRUST_RULES);
    const result = await service.propose(INPUT);
    expect(result.decision.decision).toBe("ALLOW");
    expect(result.decision.reasonCode).toBe(ReasonCode.ON_TRUST_LIST);
    expect(result.record?.status).toBe("AUTHORIZED");
  });

  it("ASKs when the amount differs from the price on the trust list (AI authorization on)", async () => {
    const { service } = makeService(TRUST_RULES);
    const result = await service.propose({ ...INPUT, amountMinor: 1500 });
    expect(result.decision.decision).toBe("ASK");
    expect(result.decision.reasonCode).toBe(ReasonCode.AMOUNT_OFF_TRUST_LIST);
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

  it("ASKs for a payee that is not on the trust list (AI authorization on)", async () => {
    const { service } = makeService(TRUST_RULES);
    const result = await service.propose({ ...INPUT, payee: "Brand New Shop" });
    expect(result.decision.decision).toBe("ASK");
    expect(result.decision.reasonCode).toBe(ReasonCode.NOT_ON_TRUST_LIST);
  });

  it("ignores the retired new-payee flag: an exact list match still ALLOWs (AI authorization on)", async () => {
    const { service } = makeService({
      ...TRUST_RULES,
      requireApprovalForNewPayee: true,
    });
    const result = await service.propose(INPUT);
    expect(result.decision.decision).toBe("ALLOW");
    expect(result.decision.reasonCode).toBe(ReasonCode.ON_TRUST_LIST);
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

    // With the shipped default rules (AI authorization off), the one tool the
    // agent has can only ever come back ASK or DENY — never a self-approved
    // ALLOW.
    expect(result.decision).toBe("ASK");
    expect(await purchases.getById(result.requestId)).not.toBeNull();
    expect(result.decidedBy).toContain("deterministic");
  });
});

describe("agent configuration", () => {
  it("defaults the base URL and agent id", () => {
    const config = readAgentConfig({
      NODE_ENV: "test",
      AGENT_API_KEY: "placeholder-key",
      AGENT_MODEL: "some-model",
    });
    expect(config.baseUrl).toBe("https://api.experientiallabs.ai/v1");
    expect(config.agentId).toBe("ai-agent");
  });

  it("names missing variables without leaking values", () => {
    try {
      readAgentConfig({ NODE_ENV: "test", AGENT_API_KEY: "super-secret-value" });
      throw new Error("expected readAgentConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentConfigError);
      const message = (error as Error).message;
      expect(message).toContain("AGENT_MODEL");
      expect(message).not.toContain("super-secret-value");
    }
  });

  it("requires an API key", () => {
    expect(() => readAgentEndpoint({ NODE_ENV: "test" })).toThrow(AgentConfigError);
  });
});

describe("describeRules", () => {
  it("lists the permitted categories and the hard cap", () => {
    const text = describeRules(RULES);
    expect(text).toContain("software");
    expect(text).toContain("office");
    expect(text).toContain("NEVER override");
  });

  it("tells the model plainly that nothing is automatic while AI authorization is off", () => {
    expect(describeRules(RULES)).toContain("Auto-approve is OFF");
    expect(describeRules(RULES)).toContain("nothing is paid automatically");
  });

  it("describes the trust list entry by entry when AI authorization is on", () => {
    const text = describeRules(TRUST_RULES);
    expect(text).toContain("AI authorization is ON");
    expect(text).toContain("Acme Software · A one-year license · 5.00 USD");
    expect(text).toContain("Auto budget for the month: 20.00 USD");
    expect(text).toContain("each at most once a month");
    expect(text).toContain("Anything not on that list, at a different price");
    expect(text).toContain("already auto-paid this");
    expect(text).not.toContain("Auto-approve is OFF");
  });

  it("tells the model an empty trust list still waits for the owner", () => {
    const text = describeRules({ ...TRUST_RULES, autoAllowlist: [] });
    expect(text).toContain("trust list is empty");
    expect(text).toContain("still waits for the owner");
  });

  it("says nothing can be authorized when there are no rules", () => {
    expect(describeRules(null)).toContain("No spending rules");
  });
});
