/**
 * Purchase lifecycle tests (Phase 3).
 *
 * Covers the approval lifecycle, the re-check-against-current-rules rule, the
 * immutability/fingerprint guarantee, and the storage interface.
 */

import { describe, expect, it } from "vitest";

import type { PurchaseRequest, SpendingRules, SpendingState } from "../authorization";
import { computeFingerprint } from "./fingerprint";
import {
  approvePurchase,
  proposePurchase,
  rejectPurchase,
  revalidateBeforeExecution,
} from "./lifecycle";
import { InMemoryPurchaseStore } from "./store";

/**
 * Mechanics fixture: auto-approve ON. The lifecycle module's job (status
 * transitions, re-checks, fingerprints) is independent of the Option 1 policy;
 * the Option 1 behavior itself is proven in dedicated tests below and in the
 * engine tests.
 */
const RULES: SpendingRules = {
  ruleVersion: "v1",
  currency: "USD",
  perPurchaseAutoLimitMinor: 1000,
  monthlyCapMinor: 5000,
  permittedCategories: ["office", "books"],
  requireApprovalForNewPayee: false,
  autoApproveEnabled: true,
};

/** The product default (Option 1): auto-approve OFF, every request needs you. */
const STRICT_RULES: SpendingRules = { ...RULES, autoApproveEnabled: false };

const STATE: SpendingState = { spentThisMonthMinor: 0, knownPayees: [] };

const NOW = new Date("2026-10-09T12:00:00.000Z");
const LATER = new Date("2026-10-09T12:05:00.000Z");

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

// --- proposing --------------------------------------------------------------

describe("proposePurchase", () => {
  it("records an ALLOW as AUTHORIZED", () => {
    const outcome = proposePurchase(request(), RULES, STATE, NOW);
    expect(outcome.ok).toBe(true);
    expect(outcome.record?.status).toBe("AUTHORIZED");
    expect(outcome.record?.evaluations).toHaveLength(1);
    expect(outcome.record?.evaluations[0]?.context).toBe("PROPOSAL");
  });

  it("records an ASK as PENDING_APPROVAL", () => {
    const outcome = proposePurchase(request({ amountMinor: 1500 }), RULES, STATE, NOW);
    expect(outcome.record?.status).toBe("PENDING_APPROVAL");
  });

  it("records a DENY as DENIED", () => {
    const outcome = proposePurchase(request({ category: "gambling" }), RULES, STATE, NOW);
    expect(outcome.record?.status).toBe("DENIED");
  });

  it("Option 1: with auto-approve off, even a small in-limit request is PENDING_APPROVAL", () => {
    const outcome = proposePurchase(request(), STRICT_RULES, STATE, NOW);
    expect(outcome.record?.status).toBe("PENDING_APPROVAL");
    expect(outcome.decision.decision).toBe("ASK");
  });

  it("does not create a record for a malformed request, but still returns DENY", () => {
    const outcome = proposePurchase({ amountMinor: 500 }, RULES, STATE, NOW);
    expect(outcome.ok).toBe(false);
    expect(outcome.record).toBeNull();
    expect(outcome.decision.decision).toBe("DENY");
  });
});

// --- fingerprints / immutability -------------------------------------------

describe("fingerprint", () => {
  it("is stable for identical material details", () => {
    expect(computeFingerprint(request())).toBe(computeFingerprint(request()));
  });

  it("changes when a material detail changes (a change is a new request)", () => {
    expect(computeFingerprint(request())).not.toBe(
      computeFingerprint(request({ amountMinor: 501 })),
    );
    expect(computeFingerprint(request())).not.toBe(
      computeFingerprint(request({ payee: "Other Shop" })),
    );
  });

  it("ignores non-material fields (id) so identity is about the facts", () => {
    // Note: the id is the record key; the fingerprint is about material facts.
    expect(computeFingerprint(request({ id: "a" }))).toBe(
      computeFingerprint(request({ id: "b" })),
    );
  });
});

// --- approval ---------------------------------------------------------------

describe("approvePurchase", () => {
  it("approves a pending request and records who/when", () => {
    const proposed = proposePurchase(request({ amountMinor: 1500 }), RULES, STATE, NOW);
    const record = proposed.record!;
    const outcome = approvePurchase(record, "owner@example.com", RULES, STATE, LATER);
    expect(outcome.ok).toBe(true);
    expect(outcome.record.status).toBe("APPROVED");
    expect(outcome.record.approval?.approvedBy).toBe("owner@example.com");
    expect(outcome.record.evaluations.map((e) => e.context)).toEqual([
      "PROPOSAL",
      "APPROVAL",
    ]);
  });

  it("refuses to approve a request that is not pending", () => {
    const record = proposePurchase(request(), RULES, STATE, NOW).record!; // AUTHORIZED
    const outcome = approvePurchase(record, "owner@example.com", RULES, STATE, LATER);
    expect(outcome.ok).toBe(false);
    expect(outcome.record.status).toBe("AUTHORIZED");
  });

  it("cannot approve past the monthly cap (re-check against CURRENT state)", () => {
    const record = proposePurchase(request({ amountMinor: 1500 }), RULES, STATE, NOW).record!;
    // Budget has since been nearly exhausted.
    const outcome = approvePurchase(
      record,
      "owner@example.com",
      RULES,
      { spentThisMonthMinor: 4500, knownPayees: [] },
      LATER,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.record.status).toBe("DENIED");
    expect(outcome.decision.reasonCode).toBe("MONTHLY_CAP_EXCEEDED");
  });

  it("is idempotent-safe: a second approval attempt is refused once approved", () => {
    const record = proposePurchase(request({ amountMinor: 1500 }), RULES, STATE, NOW).record!;
    const first = approvePurchase(record, "owner@example.com", RULES, STATE, LATER);
    const second = approvePurchase(first.record, "owner@example.com", RULES, STATE, LATER);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.record.status).toBe("APPROVED");
  });
});

describe("rejectPurchase", () => {
  it("rejects a pending request and records the reason", () => {
    const record = proposePurchase(request({ amountMinor: 1500 }), RULES, STATE, NOW).record!;
    const outcome = rejectPurchase(record, "owner@example.com", LATER, "Not this month");
    expect(outcome.ok).toBe(true);
    expect(outcome.record.status).toBe("REJECTED");
    expect(outcome.record.rejection?.reason).toBe("Not this month");
  });

  it("refuses to reject a request that is not pending", () => {
    const record = proposePurchase(request(), RULES, STATE, NOW).record!;
    const outcome = rejectPurchase(record, "owner@example.com", LATER);
    expect(outcome.ok).toBe(false);
  });
});

// --- revalidation before execution -----------------------------------------

describe("revalidateBeforeExecution", () => {
  it("clears an AUTHORIZED request that is still allowed", () => {
    const record = proposePurchase(request(), RULES, STATE, NOW).record!;
    const outcome = revalidateBeforeExecution(record, RULES, STATE, LATER);
    expect(outcome.ok).toBe(true);
    expect(outcome.record.evaluations.at(-1)?.context).toBe("PRE_EXECUTION");
  });

  it("blocks and denies an APPROVED request when the cap is no longer satisfiable", () => {
    const pending = proposePurchase(request({ amountMinor: 1500 }), RULES, STATE, NOW).record!;
    const approved = approvePurchase(pending, "owner@example.com", RULES, STATE, LATER).record;
    const outcome = revalidateBeforeExecution(
      approved,
      RULES,
      { spentThisMonthMinor: 4500, knownPayees: [] },
      LATER,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.record.status).toBe("DENIED");
  });

  it("downgrades an AUTHORIZED request to PENDING_APPROVAL if rules tighten", () => {
    const record = proposePurchase(request({ amountMinor: 500 }), RULES, STATE, NOW).record!;
    const tightened = { ...RULES, perPurchaseAutoLimitMinor: 100 };
    const outcome = revalidateBeforeExecution(record, tightened, STATE, LATER);
    expect(outcome.ok).toBe(false);
    expect(outcome.record.status).toBe("PENDING_APPROVAL");
  });

  it("downgrades a legacy AUTHORIZED request when auto-approve has since been switched off", () => {
    // Option 1 retroactive protection: a record authorized under older rules
    // cannot ride them to execution; the current rules ask for the owner.
    const record = proposePurchase(request({ amountMinor: 500 }), RULES, STATE, NOW).record!;
    expect(record.status).toBe("AUTHORIZED");
    const outcome = revalidateBeforeExecution(record, STRICT_RULES, STATE, LATER);
    expect(outcome.ok).toBe(false);
    expect(outcome.record.status).toBe("PENDING_APPROVAL");
  });

  it("lets an APPROVED request proceed even though it still needs approval", () => {
    const pending = proposePurchase(request({ amountMinor: 1500 }), RULES, STATE, NOW).record!;
    const approved = approvePurchase(pending, "owner@example.com", RULES, STATE, LATER).record;
    const outcome = revalidateBeforeExecution(approved, RULES, STATE, LATER);
    expect(outcome.ok).toBe(true);
    expect(outcome.record.status).toBe("APPROVED");
  });

  it("refuses when the request is not ready to execute", () => {
    const record = proposePurchase(request(), RULES, STATE, NOW).record!;
    const outcome = revalidateBeforeExecution(
      { ...record, status: "REJECTED" },
      RULES,
      STATE,
      LATER,
    );
    expect(outcome.ok).toBe(false);
  });
});

// --- store ------------------------------------------------------------------

describe("InMemoryPurchaseStore", () => {
  it("saves, reads, lists, and filters records", async () => {
    const store = new InMemoryPurchaseStore();
    const allowed = proposePurchase(request({ id: "r1" }), RULES, STATE, NOW).record!;
    const pending = proposePurchase(request({ id: "r2", amountMinor: 1500 }), RULES, STATE, NOW)
      .record!;

    await store.save(allowed);
    await store.save(pending);

    expect((await store.getById("r1"))?.id).toBe("r1");
    expect(await store.getById("missing")).toBeNull();
    expect((await store.list())).toHaveLength(2);
    expect((await store.listByStatus("PENDING_APPROVAL")).map((r) => r.id)).toEqual(["r2"]);
  });
});
