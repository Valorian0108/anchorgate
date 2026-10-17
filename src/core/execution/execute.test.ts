/**
 * Execution tests (Phase 4).
 *
 * These prove the security-critical behavior of the execution boundary:
 *   - payment happens only after the final authorization gate,
 *   - the amount can never change between authorization and payment,
 *   - a blocked / failed / mismatched payment is never counted,
 *   - a verified capture is counted exactly once.
 *
 * They use a fake `PaymentGateway`; the real PayPal adapter is tested separately
 * and only runs against a configured sandbox.
 */

import { describe, expect, it } from "vitest";

import type {
  PurchaseRequest,
  SpendingRules,
  SpendingState,
} from "../authorization";
import {
  approvePurchase,
  proposePurchase,
} from "../purchases";
import { InMemorySpendingStore, SpendingLedger } from "../spending";
import {
  executeAuthorizedPurchase,
  reconcilePendingPurchase,
} from "./execute";
import type {
  PaymentGateway,
  PaymentInstruction,
  PaymentOutcome,
} from "./types";

/**
 * Mechanics fixture: AI authorization ON with a trust list (trust mode, owner
 * decision, 16 oct 2026), so these tests can exercise the AUTHORIZED path of
 * the execution boundary. The default request is an exact match for the first
 * entry; 900 is listed too, so the exact-amount test can use a second price.
 * Money-boundary enforcement ("nothing spends without the owner unless the
 * list clears it") has its own dedicated tests below.
 */
const RULES: SpendingRules = {
  ruleVersion: "v1",
  currency: "USD",
  perPurchaseAutoLimitMinor: 1000, // retired: the engine no longer reads this line
  monthlyCapMinor: 5000,
  permittedCategories: ["office", "books"],
  requireApprovalForNewPayee: false,
  autoApproveEnabled: true,
  autoAllowlist: [
    { payee: "Acme Supplies", purpose: "Office supplies", amountMinor: 500 },
    { payee: "Acme Supplies", purpose: "Office supplies", amountMinor: 900 },
  ],
  autoBudgetMinor: 2000,
};

/** The product default: AI authorization OFF, every request needs you. */
const STRICT_RULES: SpendingRules = { ...RULES, autoApproveEnabled: false };

const EMPTY_STATE: SpendingState = { spentThisMonthMinor: 0, knownPayees: [] };
const NOW = new Date("2026-10-09T12:00:00.000Z");

function request(overrides: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id: "req-1",
    agentId: "agent-1",
    payee: "Acme Supplies",
    purpose: "Office supplies",
    category: "office",
    amountMinor: 500,
    currency: "USD",
    ...overrides,
  };
}

/** A gateway that replays a fixed list of outcomes and records its calls. */
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

function captured(
  overrides: Partial<Extract<PaymentOutcome, { status: "CAPTURED" }>> = {},
): PaymentOutcome {
  return {
    status: "CAPTURED",
    providerCaptureId: "CAP-1",
    amountMinor: 500,
    currency: "USD",
    capturedAt: "2026-10-09T12:00:05.000Z",
    ...overrides,
  };
}

function freshLedger(): SpendingLedger {
  return new SpendingLedger(new InMemorySpendingStore());
}

describe("executeAuthorizedPurchase", () => {
  it("pays an AUTHORIZED request, verifies the capture, and counts it once", async () => {
    const record = proposePurchase(request(), RULES, EMPTY_STATE, NOW).record!;
    const gateway = new FakeGateway([captured()]);
    const ledger = freshLedger();

    const outcome = await executeAuthorizedPurchase({
      record,
      rules: RULES,
      state: EMPTY_STATE,
      now: NOW,
      gateway,
      ledger,
    });

    expect(outcome.status).toBe("CAPTURED");
    expect(outcome.record.status).toBe("EXECUTED");
    expect(gateway.calls).toHaveLength(1);
    expect(gateway.calls[0]?.amountMinor).toBe(500);
    expect(gateway.calls[0]?.payee).toBe("Acme Supplies");
    expect(await ledger.capturedMinor()).toBe(500);
  });

  it("sends the exact authorized amount, so it cannot change before payment", async () => {
    const record = proposePurchase(
      request({ amountMinor: 900 }),
      RULES,
      EMPTY_STATE,
      NOW,
    ).record!;
    const gateway = new FakeGateway([captured({ amountMinor: 900 })]);
    await executeAuthorizedPurchase({
      record,
      rules: RULES,
      state: EMPTY_STATE,
      now: NOW,
      gateway,
      ledger: freshLedger(),
    });
    expect(gateway.calls[0]).toMatchObject({ amountMinor: 900, currency: "USD" });
  });

  it("executes an APPROVED request", async () => {
    const pending = proposePurchase(
      request({ amountMinor: 1500 }),
      RULES,
      EMPTY_STATE,
      NOW,
    ).record!;
    const approved = approvePurchase(pending, "owner@example.com", RULES, EMPTY_STATE, NOW)
      .record;
    const gateway = new FakeGateway([captured({ amountMinor: 1500 })]);
    const ledger = freshLedger();

    const outcome = await executeAuthorizedPurchase({
      record: approved,
      rules: RULES,
      state: EMPTY_STATE,
      now: NOW,
      gateway,
      ledger,
    });

    expect(outcome.status).toBe("CAPTURED");
    expect(outcome.record.status).toBe("EXECUTED");
    expect(await ledger.capturedMinor()).toBe(1500);
  });

  it("pays an APPROVED request with AI authorization off — the owner is the gate", async () => {
    const pending = proposePurchase(request({ amountMinor: 500 }), STRICT_RULES, EMPTY_STATE, NOW)
      .record!;
    expect(pending.status).toBe("PENDING_APPROVAL");
    const approved = approvePurchase(pending, "owner@example.com", STRICT_RULES, EMPTY_STATE, NOW)
      .record;
    const gateway = new FakeGateway([captured()]);
    const ledger = freshLedger();

    const outcome = await executeAuthorizedPurchase({
      record: approved,
      rules: STRICT_RULES,
      state: EMPTY_STATE,
      now: NOW,
      gateway,
      ledger,
    });

    expect(outcome.status).toBe("CAPTURED");
    expect(outcome.record.status).toBe("EXECUTED");
    expect(await ledger.capturedMinor()).toBe(500);
  });

  it("blocks at the gate when the monthly cap would be exceeded, without paying", async () => {
    const record = proposePurchase(request({ amountMinor: 500 }), RULES, EMPTY_STATE, NOW)
      .record!;
    const gateway = new FakeGateway([captured()]);
    const ledger = freshLedger();

    // By execution time, 4800 of the 5000 cap is already spent.
    const state: SpendingState = { spentThisMonthMinor: 4800, knownPayees: [] };
    const outcome = await executeAuthorizedPurchase({
      record,
      rules: RULES,
      state,
      now: NOW,
      gateway,
      ledger,
    });

    expect(outcome.status).toBe("BLOCKED");
    expect(outcome.record.status).toBe("DENIED");
    expect(gateway.calls).toHaveLength(0);
    expect(await ledger.capturedMinor()).toBe(0);
  });

  it("downgrades to pending when rules tighten before execution, without paying", async () => {
    const record = proposePurchase(request({ amountMinor: 500 }), RULES, EMPTY_STATE, NOW)
      .record!;
    // The auto budget shrank below the listed price between proposal and
    // execution: the exact match no longer clears and drops back to the owner.
    const tightened: SpendingRules = { ...RULES, autoBudgetMinor: 100 };
    const gateway = new FakeGateway([captured()]);

    const outcome = await executeAuthorizedPurchase({
      record,
      rules: tightened,
      state: EMPTY_STATE,
      now: NOW,
      gateway,
      ledger: freshLedger(),
    });

    expect(outcome.status).toBe("BLOCKED");
    expect(outcome.record.status).toBe("PENDING_APPROVAL");
    expect(gateway.calls).toHaveLength(0);
  });

  it("never pays an AUTHORIZED record once AI authorization is switched off", async () => {
    // The strongest form of "nothing spends without you": a record the trust
    // list cleared is stopped at the money boundary when the current rules
    // require the owner, and no provider call happens.
    const record = proposePurchase(request({ amountMinor: 500 }), RULES, EMPTY_STATE, NOW)
      .record!;
    expect(record.status).toBe("AUTHORIZED");
    const gateway = new FakeGateway([captured()]);
    const ledger = freshLedger();

    const outcome = await executeAuthorizedPurchase({
      record,
      rules: STRICT_RULES,
      state: EMPTY_STATE,
      now: NOW,
      gateway,
      ledger,
    });

    expect(outcome.status).toBe("BLOCKED");
    expect(outcome.record.status).toBe("PENDING_APPROVAL");
    expect(gateway.calls).toHaveLength(0);
    expect(await ledger.capturedMinor()).toBe(0);
  });

  it("counts nothing when the provider fails", async () => {
    const record = proposePurchase(request(), RULES, EMPTY_STATE, NOW).record!;
    const gateway = new FakeGateway([{ status: "FAILED", reason: "declined" }]);
    const ledger = freshLedger();

    const outcome = await executeAuthorizedPurchase({
      record,
      rules: RULES,
      state: EMPTY_STATE,
      now: NOW,
      gateway,
      ledger,
    });

    expect(outcome.status).toBe("FAILED");
    expect(outcome.record.status).toBe("AUTHORIZED");
    expect(await ledger.capturedMinor()).toBe(0);
    expect((await ledger.events()).some((e) => e.kind === "CAPTURE_FAILED")).toBe(true);
  });

  it("never counts a capture whose amount does not match the authorization", async () => {
    const record = proposePurchase(request({ amountMinor: 500 }), RULES, EMPTY_STATE, NOW)
      .record!;
    const gateway = new FakeGateway([captured({ amountMinor: 999 })]);
    const ledger = freshLedger();

    const outcome = await executeAuthorizedPurchase({
      record,
      rules: RULES,
      state: EMPTY_STATE,
      now: NOW,
      gateway,
      ledger,
    });

    expect(outcome.status).toBe("MISMATCH");
    expect(outcome.record.status).toBe("AUTHORIZED");
    expect(await ledger.capturedMinor()).toBe(0);
  });

  it("does not execute a request that is not ready", async () => {
    const record = proposePurchase(
      request({ amountMinor: 1500 }),
      RULES,
      EMPTY_STATE,
      NOW,
    ).record!; // PENDING_APPROVAL
    const gateway = new FakeGateway([captured()]);

    const outcome = await executeAuthorizedPurchase({
      record,
      rules: RULES,
      state: EMPTY_STATE,
      now: NOW,
      gateway,
      ledger: freshLedger(),
    });

    expect(outcome.status).toBe("BLOCKED");
    expect(gateway.calls).toHaveLength(0);
  });
});

function pending(
  overrides: Partial<Extract<PaymentOutcome, { status: "PENDING" }>> = {},
): PaymentOutcome {
  return {
    status: "PENDING",
    providerCaptureId: "CAP-P1",
    amountMinor: 500,
    currency: "USD",
    createdAt: "2026-10-09T12:00:05.000Z",
    reason: "PENDING_REVIEW",
    ...overrides,
  };
}

describe("pending captures", () => {
  it("records a pending capture for audit but counts nothing", async () => {
    const record = proposePurchase(request(), RULES, EMPTY_STATE, NOW).record!;
    const ledger = freshLedger();

    const outcome = await executeAuthorizedPurchase({
      record,
      rules: RULES,
      state: EMPTY_STATE,
      now: NOW,
      gateway: new FakeGateway([pending()]),
      ledger,
    });

    expect(outcome.status).toBe("PENDING");
    expect(outcome.record.status).toBe("PENDING_SETTLEMENT");
    expect(outcome.pending?.providerCaptureId).toBe("CAP-P1");
    expect(await ledger.capturedMinor()).toBe(0);

    const events = await ledger.eventsForRequest(record.id);
    const pendingEvent = events.find((e) => e.kind === "CAPTURE_PENDING");
    expect(pendingEvent?.providerRef).toBe("CAP-P1");
    expect(events.some((e) => e.kind === "CAPTURE_VERIFIED")).toBe(false);
  });

  it("reconciles a settled capture and counts it exactly once", async () => {
    const record = proposePurchase(request(), RULES, EMPTY_STATE, NOW).record!;
    const ledger = freshLedger();
    const gateway = new FakeGateway(
      [pending()],
      captured({ providerCaptureId: "CAP-P1" }),
    );

    const first = await executeAuthorizedPurchase({
      record,
      rules: RULES,
      state: EMPTY_STATE,
      now: NOW,
      gateway,
      ledger,
    });
    expect(first.status).toBe("PENDING");

    const reconciled = await reconcilePendingPurchase({
      record: first.record,
      gateway,
      ledger,
      now: NOW,
    });
    expect(reconciled.status).toBe("CAPTURED");
    expect(reconciled.record.status).toBe("EXECUTED");
    expect(await ledger.capturedMinor()).toBe(500);
    expect(gateway.checkCalls).toEqual(["CAP-P1"]);

    // A second reconcile must not double-count.
    const again = await reconcilePendingPurchase({
      record: first.record,
      gateway,
      ledger,
      now: NOW,
    });
    expect(again.status).toBe("CAPTURED");
    expect(await ledger.capturedMinor()).toBe(500);
  });

  it("keeps reporting PENDING while the capture is still unsettled", async () => {
    const record = proposePurchase(request(), RULES, EMPTY_STATE, NOW).record!;
    const ledger = freshLedger();
    const gateway = new FakeGateway([pending()], pending());

    const first = await executeAuthorizedPurchase({
      record,
      rules: RULES,
      state: EMPTY_STATE,
      now: NOW,
      gateway,
      ledger,
    });

    const again = await reconcilePendingPurchase({
      record: first.record,
      gateway,
      ledger,
      now: NOW,
    });
    expect(again.status).toBe("PENDING");
    expect(await ledger.capturedMinor()).toBe(0);
  });

  it("records a failure and counts nothing when the pending capture is declined", async () => {
    const record = proposePurchase(request(), RULES, EMPTY_STATE, NOW).record!;
    const ledger = freshLedger();
    const gateway = new FakeGateway([pending()], { status: "FAILED", reason: "declined" });

    const first = await executeAuthorizedPurchase({
      record,
      rules: RULES,
      state: EMPTY_STATE,
      now: NOW,
      gateway,
      ledger,
    });

    const again = await reconcilePendingPurchase({
      record: first.record,
      gateway,
      ledger,
      now: NOW,
    });
    expect(again.status).toBe("FAILED");
    expect(await ledger.capturedMinor()).toBe(0);
    expect(
      (await ledger.eventsForRequest(record.id)).some((e) => e.kind === "CAPTURE_FAILED"),
    ).toBe(true);
  });

  it("never counts a settled capture whose amount does not match", async () => {
    const record = proposePurchase(request(), RULES, EMPTY_STATE, NOW).record!;
    const ledger = freshLedger();
    const gateway = new FakeGateway(
      [pending()],
      captured({ providerCaptureId: "CAP-P1", amountMinor: 999 }),
    );

    const first = await executeAuthorizedPurchase({
      record,
      rules: RULES,
      state: EMPTY_STATE,
      now: NOW,
      gateway,
      ledger,
    });

    const again = await reconcilePendingPurchase({
      record: first.record,
      gateway,
      ledger,
      now: NOW,
    });
    expect(again.status).toBe("MISMATCH");
    expect(await ledger.capturedMinor()).toBe(0);
  });

  it("fails safely when there is no pending capture to reconcile", async () => {
    const record = proposePurchase(request(), RULES, EMPTY_STATE, NOW).record!;
    const outcome = await reconcilePendingPurchase({
      record,
      gateway: new FakeGateway([]),
      ledger: freshLedger(),
      now: NOW,
    });
    expect(outcome.status).toBe("FAILED");
  });
});
