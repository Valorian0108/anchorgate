/**
 * Purchase application-service tests.
 *
 * These prove the END-TO-END product flow that the CLI drives:
 *
 *   propose -> approve -> pay -> verified capture -> counted once
 *
 * against the SAME store interfaces the durable PostgreSQL stores implement.
 * The payment provider is a fake; the real PayPal adapter is tested separately
 * and only runs against a configured sandbox.
 *
 * The security-critical properties under test:
 *   - a human approval is required where the rules say so,
 *   - a hard constraint (the monthly cap) can never be overridden by approval,
 *   - execution re-checks the current rules/budget immediately before paying,
 *   - a verified capture is counted exactly once, and never for a blocked pay.
 */

import { describe, expect, it } from "vitest";

import {
  InMemorySpendingRulesStore,
  type SpendingRules,
  type SpendingState,
} from "../core/authorization";
import { InMemoryPurchaseStore, proposePurchase } from "../core/purchases";
import { InMemorySpendingStore } from "../core/spending";
import type { PaymentGateway, PaymentInstruction, PaymentOutcome } from "../core/execution";
import { PurchaseService } from "./purchaseService";

const RULES: SpendingRules = {
  ruleVersion: "v1",
  currency: "USD",
  perPurchaseAutoLimitMinor: 1000,
  monthlyCapMinor: 5000,
  permittedCategories: ["office", "books"],
  requireApprovalForNewPayee: false,
};

const NOW = new Date("2026-10-09T12:00:00.000Z");
const EMPTY_STATE: SpendingState = { spentThisMonthMinor: 0, knownPayees: [] };

interface RequestOverrides {
  id?: string;
  payee?: string;
  amountMinor?: number;
  category?: string;
}

function buildRequest(overrides: RequestOverrides = {}) {
  return {
    id: overrides.id ?? "req-1",
    agentId: "agent-1",
    payee: overrides.payee ?? "Acme Supplies",
    purpose: "Office supplies",
    category: overrides.category ?? "office",
    amountMinor: overrides.amountMinor ?? 500,
    currency: "USD",
  };
}

/** A gateway that replays fixed outcomes and records its calls. */
class FakeGateway implements PaymentGateway {
  readonly calls: PaymentInstruction[] = [];
  readonly checkCalls: string[] = [];
  constructor(
    private readonly outcomes: PaymentOutcome[],
    private readonly checkOutcome: PaymentOutcome = {
      status: "FAILED",
      reason: "checkCapture was not expected",
    },
  ) {}
  async pay(instruction: PaymentInstruction): Promise<PaymentOutcome> {
    this.calls.push(instruction);
    const index = Math.min(this.calls.length - 1, this.outcomes.length - 1);
    return this.outcomes[index]!;
  }
  async checkCapture(providerCaptureId: string): Promise<PaymentOutcome> {
    this.checkCalls.push(providerCaptureId);
    return this.checkOutcome;
  }
}

function captured(amountMinor = 500): PaymentOutcome {
  return {
    status: "CAPTURED",
    providerCaptureId: "CAP-1",
    amountMinor,
    currency: "USD",
    capturedAt: "2026-10-09T12:00:05.000Z",
  };
}

function pending(amountMinor = 500): PaymentOutcome {
  return {
    status: "PENDING",
    providerCaptureId: "CAP-P1",
    amountMinor,
    currency: "USD",
    createdAt: "2026-10-09T12:00:05.000Z",
    reason: "PENDING_REVIEW",
  };
}

interface Harness {
  service: PurchaseService;
  purchases: InMemoryPurchaseStore;
  spending: InMemorySpendingStore;
  rules: InMemorySpendingRulesStore;
  gateway: FakeGateway;
}

function makeHarness(options: {
  rules?: SpendingRules | null;
  outcomes?: PaymentOutcome[];
  checkOutcome?: PaymentOutcome;
} = {}): Harness {
  const purchases = new InMemoryPurchaseStore();
  const spending = new InMemorySpendingStore();
  const rules = new InMemorySpendingRulesStore(
    options.rules === undefined ? RULES : options.rules,
  );
  const gateway = new FakeGateway(options.outcomes ?? [], options.checkOutcome);
  const service = new PurchaseService({
    purchases,
    spending,
    rules,
    paymentGateway: () => gateway,
    now: () => NOW,
  });
  return { service, purchases, spending, rules, gateway };
}

/** Propose a request and persist it, exactly as the agent path does. */
async function seed(
  harness: Harness,
  overrides: RequestOverrides = {},
  options: { rules?: SpendingRules; state?: SpendingState } = {},
) {
  const outcome = proposePurchase(
    buildRequest(overrides),
    options.rules ?? RULES,
    options.state ?? EMPTY_STATE,
    NOW,
  );
  const record = outcome.record!;
  await harness.purchases.save(record);
  return record;
}

describe("PurchaseService.budget", () => {
  it("reports the active rules and the verified spend this month", async () => {
    const harness = makeHarness();
    const budget = await harness.service.budget();

    expect(budget.rules).toMatchObject({ currency: "USD", monthlyCapMinor: 5000 });
    expect(budget.spentThisMonthMinor).toBe(0);
    expect(budget.remainingMinor).toBe(5000);
    expect(budget.currency).toBe("USD");
  });

  it("reports no budget when no rules are configured", async () => {
    const harness = makeHarness({ rules: null });
    const budget = await harness.service.budget();
    expect(budget.rules).toBeNull();
    expect(budget.remainingMinor).toBeNull();
  });
});

describe("PurchaseService approval", () => {
  it("approves a pending request and persists APPROVED", async () => {
    const harness = makeHarness();
    await seed(harness, { amountMinor: 1500 }); // over the auto-approve limit -> ASK

    const pending = await harness.service.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.status).toBe("PENDING_APPROVAL");

    const outcome = await harness.service.approve("req-1", "owner@example.com");
    expect(outcome.ok).toBe(true);
    expect(outcome.record.status).toBe("APPROVED");

    const stored = await harness.purchases.getById("req-1");
    expect(stored?.status).toBe("APPROVED");
    expect(stored?.approval?.approvedBy).toBe("owner@example.com");

    const events = await harness.spending.list();
    expect(events.some((e) => e.kind === "APPROVED" && e.requestId === "req-1")).toBe(true);
  });

  it("refuses approval when the monthly cap would now be exceeded (hard limit)", async () => {
    const harness = makeHarness();
    await seed(harness, { amountMinor: 1500 }); // pending under the original cap

    // Rules tighten after the request was filed: the cap can no longer fit it.
    await harness.rules.save({ ...RULES, monthlyCapMinor: 1000 });

    const outcome = await harness.service.approve("req-1", "owner@example.com");
    expect(outcome.ok).toBe(false);
    expect(outcome.record.status).toBe("DENIED");

    const stored = await harness.purchases.getById("req-1");
    expect(stored?.status).toBe("DENIED");
  });

  it("rejects a pending request, finally", async () => {
    const harness = makeHarness();
    await seed(harness, { amountMinor: 1500 });

    const outcome = await harness.service.reject("req-1", "owner@example.com", "not needed");
    expect(outcome.ok).toBe(true);
    expect(outcome.record.status).toBe("REJECTED");

    const stored = await harness.purchases.getById("req-1");
    expect(stored?.rejection?.reason).toBe("not needed");

    const events = await harness.spending.list();
    expect(events.some((e) => e.kind === "REJECTED" && e.requestId === "req-1")).toBe(true);
  });

  it("cannot approve a request that is not awaiting approval", async () => {
    const harness = makeHarness();
    await seed(harness, { amountMinor: 500 }); // ALLOW -> AUTHORIZED, no approval needed
    const outcome = await harness.service.approve("req-1", "owner@example.com");
    expect(outcome.ok).toBe(false);
    expect(outcome.record.status).toBe("AUTHORIZED");
  });
});

describe("PurchaseService payment", () => {
  it("pays an approved request, counts the capture exactly once, and cannot pay twice", async () => {
    const harness = makeHarness({ outcomes: [captured(1500)] });
    await seed(harness, { amountMinor: 1500 });
    await harness.service.approve("req-1", "owner@example.com");

    const result = await harness.service.pay("req-1");
    expect(result.outcome.status).toBe("CAPTURED");
    expect(result.outcome.record.status).toBe("EXECUTED");
    expect(harness.gateway.calls).toHaveLength(1);
    expect(harness.gateway.calls[0]?.amountMinor).toBe(1500);

    let summary = await harness.service.budget();
    expect(summary.spentThisMonthMinor).toBe(1500);
    expect(summary.remainingMinor).toBe(3500);

    // A second pay attempt is blocked by the pre-execution gate and never pays.
    const second = await harness.service.pay("req-1");
    expect(second.outcome.status).toBe("BLOCKED");
    expect(harness.gateway.calls).toHaveLength(1);

    summary = await harness.service.budget();
    expect(summary.spentThisMonthMinor).toBe(1500);
  });

  it("does not pay a request that is still awaiting approval", async () => {
    const harness = makeHarness({ outcomes: [captured(1500)] });
    await seed(harness, { amountMinor: 1500 }); // PENDING_APPROVAL

    const result = await harness.service.pay("req-1");
    expect(result.outcome.status).toBe("BLOCKED");
    expect(harness.gateway.calls).toHaveLength(0);
    expect((await harness.service.budget()).spentThisMonthMinor).toBe(0);
  });

  it("lets an approval satisfy the new-payee rule, then pays", async () => {
    const rules: SpendingRules = { ...RULES, requireApprovalForNewPayee: true };
    const harness = makeHarness({ rules, outcomes: [captured(500)] });

    // A brand-new payee under a low amount: ASK because the payee is unknown.
    await seed(harness, { amountMinor: 500 }, { rules });
    expect((await harness.purchases.getById("req-1"))?.status).toBe("PENDING_APPROVAL");

    await harness.service.approve("req-1", "owner@example.com");

    const result = await harness.service.pay("req-1");
    expect(result.outcome.status).toBe("CAPTURED");
    expect(result.outcome.record.status).toBe("EXECUTED");
    expect(harness.gateway.calls).toHaveLength(1);
  });

  it("keeps a pending capture uncounted, then counts it once on reconcile", async () => {
    const harness = makeHarness({
      outcomes: [pending(1500)],
      checkOutcome: captured(1500),
    });
    await seed(harness, { amountMinor: 1500 });
    await harness.service.approve("req-1", "owner@example.com");

    const result = await harness.service.pay("req-1", { reconcilePending: true });
    expect(result.reconciled).toBe(true);
    expect(result.outcome.status).toBe("CAPTURED");
    expect(result.outcome.record.status).toBe("EXECUTED");
    expect((await harness.service.budget()).spentThisMonthMinor).toBe(1500);

    // Reconciling again must not double-count.
    const again = await harness.service.reconcile("req-1");
    expect(again.status).toBe("CAPTURED");
    expect((await harness.service.budget()).spentThisMonthMinor).toBe(1500);
  });

  it("reports unknown request ids rather than failing silently", async () => {
    const harness = makeHarness();
    await expect(harness.service.pay("does-not-exist")).rejects.toThrow(/does-not-exist/);
  });
});

describe("PurchaseService ledger reads", () => {
  it("returns every event oldest-first, and one request's events alone", async () => {
    const harness = makeHarness({ outcomes: [captured(500)] });
    await seed(harness, { amountMinor: 500 }); // ALLOW -> AUTHORIZED, no approval needed
    await harness.service.pay("req-1");

    const all = await harness.service.allEvents();
    expect(all.length).toBeGreaterThan(0);
    expect(
      all.some((e) => e.kind === "CAPTURE_VERIFIED" && e.requestId === "req-1"),
    ).toBe(true);

    // Oldest first: the ISO timestamps are non-decreasing.
    const times = all.map((e) => e.occurredAt);
    expect(times).toEqual([...times].sort());

    const forRequest = await harness.service.eventsByRequest("req-1");
    expect(forRequest.length).toBeGreaterThan(0);
    expect(forRequest.every((e) => e.requestId === "req-1")).toBe(true);

    // A request that was never filed has no events.
    expect(await harness.service.eventsByRequest("nope")).toHaveLength(0);
  });
});
