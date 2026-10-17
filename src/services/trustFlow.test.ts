/**
 * Trust-mode composition: the automatic path end to end on the real modules.
 *
 * Proposal cleared by the list → AUTO_APPROVED marker → pre-payment re-gate →
 * capture → the spending-state math the NEXT decision reads. This mirrors
 * `settleAutoAuthorized` in lib/service.ts (which is env-bound and cannot be
 * unit-tested): the same event id (`auto-approved:<recordId>`), the same
 * marker-before-pay order, and the same `reconcilePending` flag.
 *
 * The guarantees pinned here are the ones the owner was promised: an exact
 * list match pays without a human, the money counts exactly once, the auto
 * budget stops the NEXT match, and a human-approved capture never eats the
 * auto budget.
 */

import { describe, expect, it } from "vitest";

import {
  InMemorySpendingRulesStore,
  ReasonCode,
  type SpendingRules,
} from "../core/authorization";
import type {
  PaymentGateway,
  PaymentInstruction,
  PaymentOutcome,
} from "../core/execution";
import { InMemoryPurchaseStore, proposePurchase } from "../core/purchases";
import { InMemorySpendingStore, SpendingLedger } from "../core/spending";
import { PurchaseService } from "./purchaseService";
import { readSpendingState } from "./spendingState";

const NOW = new Date("2026-10-16T12:00:00.000Z");

/** AI authorization on, one listed item, and a budget for exactly one auto buy. */
const RULES: SpendingRules = {
  ruleVersion: "owner-3",
  currency: "USD",
  perPurchaseAutoLimitMinor: 0, // retired: the engine no longer reads this line
  monthlyCapMinor: 5000,
  permittedCategories: ["office"],
  requireApprovalForNewPayee: true, // retired: the list defines trust
  autoApproveEnabled: true,
  autoAllowlist: [
    { payee: "Acme Supplies", purpose: "Office supplies", amountMinor: 500 },
  ],
  autoBudgetMinor: 500,
};

const REQUEST = {
  id: "auto-1",
  agentId: "catalog-agent",
  payee: "Acme Supplies",
  purpose: "Office supplies",
  category: "office",
  amountMinor: 500,
  currency: "USD",
};

class FakeGateway implements PaymentGateway {
  readonly calls: PaymentInstruction[] = [];
  constructor(private readonly outcomes: PaymentOutcome[]) {}
  async pay(instruction: PaymentInstruction): Promise<PaymentOutcome> {
    this.calls.push(instruction);
    const index = Math.min(this.calls.length - 1, this.outcomes.length - 1);
    return this.outcomes[index]!;
  }
  async checkCapture(): Promise<PaymentOutcome> {
    return { status: "FAILED", reason: "checkCapture was not expected" };
  }
}

function captured(ref: string): PaymentOutcome {
  return {
    status: "CAPTURED",
    providerCaptureId: ref,
    amountMinor: 500,
    currency: "USD",
    capturedAt: "2026-10-16T12:00:05.000Z",
  };
}

function makeHarness(outcomes: PaymentOutcome[]) {
  const purchases = new InMemoryPurchaseStore();
  const spending = new InMemorySpendingStore();
  const gateway = new FakeGateway(outcomes);
  const service = new PurchaseService({
    purchases,
    spending,
    rules: new InMemorySpendingRulesStore(RULES),
    paymentGateway: () => gateway,
    now: () => NOW,
  });
  return { purchases, spending, gateway, service };
}

/** Settle one exact-match proposal the way settleAutoAuthorized does. */
async function settleAuto(harness: ReturnType<typeof makeHarness>, id: string) {
  const state = await readSpendingState(harness, NOW);
  const outcome = proposePurchase({ ...REQUEST, id }, RULES, state, NOW);
  expect(outcome.decision.decision).toBe("ALLOW");
  expect(outcome.decision.reasonCode).toBe(ReasonCode.ON_TRUST_LIST);
  const record = outcome.record!;
  expect(record.status).toBe("AUTHORIZED");
  await harness.purchases.save(record);

  // The marker goes down BEFORE the payment, through the validating ledger.
  const ledger = new SpendingLedger(harness.spending);
  const marked = await ledger.record({
    id: `auto-approved:${record.id}`,
    requestId: record.id,
    kind: "AUTO_APPROVED",
    amountMinor: record.request.amountMinor,
    currency: "USD",
    occurredAt: NOW.toISOString(),
  });
  expect(marked.recorded).toBe(true);

  return harness.service.pay(record.id, { reconcilePending: true });
}

describe("the automatic path, end to end", () => {
  it("clears, marks, pays, and counts an exact list match exactly once", async () => {
    const harness = makeHarness([captured("CAP-AUTO-1")]);

    // The marker alone counts as nothing: no money has moved yet.
    const state = await readSpendingState(harness, NOW);
    expect(state.autoSpentThisMonthMinor).toBe(0);

    const result = await settleAuto(harness, "auto-1");
    expect(result.outcome.status).toBe("CAPTURED");
    expect(result.outcome.record.status).toBe("EXECUTED");
    expect(harness.gateway.calls).toHaveLength(1);
    expect(harness.gateway.calls[0]?.amountMinor).toBe(500);

    // The verified capture counts once, as auto spending.
    const after = await readSpendingState(harness, NOW);
    expect(after.spentThisMonthMinor).toBe(500);
    expect(after.autoSpentThisMonthMinor).toBe(500);
  });

  it("stops the NEXT exact match once the auto budget is used up", async () => {
    const harness = makeHarness([captured("CAP-AUTO-1"), captured("CAP-AUTO-2")]);
    await settleAuto(harness, "auto-1");

    // Same item, same exact price, fresh state: the budget is now the ask.
    const state = await readSpendingState(harness, NOW);
    const second = proposePurchase({ ...REQUEST, id: "auto-2" }, RULES, state, NOW);
    expect(second.decision.decision).toBe("ASK");
    expect(second.decision.reasonCode).toBe(ReasonCode.AUTO_BUDGET_USED);
    expect(second.record?.status).toBe("PENDING_APPROVAL");

    // And nothing reached the provider a second time.
    expect(harness.gateway.calls).toHaveLength(1);
  });

  it("counts a human-approved capture toward the cap but NOT the auto budget", async () => {
    const harness = makeHarness([captured("CAP-HUMAN")]);
    const state = await readSpendingState(harness, NOW);

    // Off-list purpose: the list asks, the owner approves, the capture pays.
    const outcome = proposePurchase(
      { ...REQUEST, id: "human-1", purpose: "Party snacks" },
      RULES,
      state,
      NOW,
    );
    expect(outcome.decision.reasonCode).toBe(ReasonCode.NOT_ON_TRUST_LIST);
    await harness.purchases.save(outcome.record!);

    const approved = await harness.service.approve("human-1", "owner@example.com");
    expect(approved.ok).toBe(true);
    const paid = await harness.service.pay("human-1");
    expect(paid.outcome.status).toBe("CAPTURED");

    const after = await readSpendingState(harness, NOW);
    expect(after.spentThisMonthMinor).toBe(500);
    expect(after.autoSpentThisMonthMinor).toBe(0);

    // The auto budget is untouched, so the listed item still clears.
    const auto = proposePurchase({ ...REQUEST, id: "auto-9" }, RULES, after, NOW);
    expect(auto.decision.decision).toBe("ALLOW");
    expect(auto.decision.reasonCode).toBe(ReasonCode.ON_TRUST_LIST);
  });

  it("keeps an auto-cleared record out of the spent figure until the capture verifies", async () => {
    const harness = makeHarness([
      { status: "FAILED", reason: "provider declined" },
    ]);

    const state = await readSpendingState(harness, NOW);
    const outcome = proposePurchase(REQUEST, RULES, state, NOW);
    await harness.purchases.save(outcome.record!);
    const ledger = new SpendingLedger(harness.spending);
    await ledger.record({
      id: "auto-approved:auto-1",
      requestId: "auto-1",
      kind: "AUTO_APPROVED",
      amountMinor: 500,
      currency: "USD",
      occurredAt: NOW.toISOString(),
    });

    // The provider declines: no capture, so nothing is spent and the auto
    // budget is untouched. The record rests AUTHORIZED, honest about itself.
    const result = await harness.service.pay("auto-1", { reconcilePending: true });
    expect(result.outcome.status).toBe("FAILED");
    expect(result.outcome.record.status).toBe("AUTHORIZED");

    const after = await readSpendingState(harness, NOW);
    expect(after.spentThisMonthMinor).toBe(0);
    expect(after.autoSpentThisMonthMinor).toBe(0);
  });
});
