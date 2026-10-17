/**
 * Spending-accounting tests (Phase 3).
 *
 * Mapped to spec section 11.2 "Spending-accounting tests". Each `it` names the
 * requirement it covers so the traceability matrix stays honest.
 */

import { describe, expect, it } from "vitest";

import { capturedMinorIn, SpendingLedger, summarizeSpending } from "./ledger";
import { utcMonthPeriod } from "./period";
import { InMemorySpendingStore } from "./store";
import type { SpendingEvent, SpendingEventKind } from "./types";

// --- helpers ----------------------------------------------------------------

function event(
  kind: SpendingEventKind,
  amountMinor: number,
  overrides: Partial<SpendingEvent> = {},
): SpendingEvent {
  return {
    id: `${kind}:${amountMinor}:${overrides.id ?? "e1"}`,
    requestId: "req-1",
    kind,
    amountMinor,
    currency: "USD",
    occurredAt: "2026-10-09T12:00:00.000Z",
    ...(kind === "CAPTURE_VERIFIED" ? { providerRef: "CAP-123" } : {}),
    ...overrides,
  };
}

const OCTOBER = {
  startIso: "2026-10-01T00:00:00.000Z",
  endIso: "2026-11-01T00:00:00.000Z",
};

// --- completed spending only from a verified capture ------------------------

describe("completed spending counts only verified captures (11.2)", () => {
  it("does NOT count a proposed, authorized, approved, or submitted request", () => {
    const events = [
      event("PROPOSED", 500, { id: "p" }),
      event("AUTHORIZED", 500, { id: "a" }),
      event("PENDING_APPROVAL", 500, { id: "pa" }),
      event("APPROVED", 500, { id: "ap" }),
      event("SUBMITTED", 500, { id: "s" }),
    ];
    expect(capturedMinorIn(events)).toBe(0);
  });

  it("counts a verified successful capture exactly once", () => {
    const events = [event("CAPTURE_VERIFIED", 500, { id: "c1" })];
    expect(capturedMinorIn(events)).toBe(500);
  });

  it("does NOT count a failed or cancelled payment", () => {
    const events = [
      event("CAPTURE_FAILED", 500, { id: "f1" }),
      event("CANCELLED", 500, { id: "x1" }),
      event("REJECTED", 500, { id: "r1" }),
      event("DENIED", 500, { id: "d1" }),
    ];
    expect(capturedMinorIn(events)).toBe(0);
  });

  it("counts several captures as their sum", () => {
    const events = [
      event("CAPTURE_VERIFIED", 500, { id: "c1", providerRef: "CAP-1" }),
      event("CAPTURE_VERIFIED", 1500, { id: "c2", providerRef: "CAP-2" }),
    ];
    expect(capturedMinorIn(events)).toBe(2000);
  });
});

// --- idempotency ------------------------------------------------------------

describe("duplicate callbacks/retries do not double-count (11.2)", () => {
  it("ignores a repeated event with the same id", async () => {
    const ledger = new SpendingLedger(new InMemorySpendingStore());
    const capture = event("CAPTURE_VERIFIED", 500, { id: "capture:CAP-123" });

    const first = await ledger.record(capture);
    const second = await ledger.record(capture);

    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
    expect(await ledger.capturedMinor()).toBe(500);
    expect((await ledger.events())).toHaveLength(1);
  });

  it("keys a capture by its provider id, so a replay is one, even with a different envelope id", async () => {
    // The provider capture id is the stable key; a retried webhook may arrive
    // with a different envelope but refers to the same capture.
    const ledger = new SpendingLedger(new InMemorySpendingStore());
    await ledger.record(
      event("CAPTURE_VERIFIED", 500, { id: "envelope-1", providerRef: "CAP-777" }),
    );
    const replay = await ledger.record(
      event("CAPTURE_VERIFIED", 500, { id: "envelope-2", providerRef: "CAP-777" }),
    );

    expect(replay.recorded).toBe(false);
    expect(await ledger.capturedMinor()).toBe(500);
    expect((await ledger.events())[0]?.id).toBe("capture:CAP-777");
  });
});

// --- validation fails closed ------------------------------------------------

describe("invalid events fail closed", () => {
  it("rejects a capture with no provider reference", async () => {
    const ledger = new SpendingLedger(new InMemorySpendingStore());
    const outcome = await ledger.record({
      id: "c1",
      requestId: "r1",
      kind: "CAPTURE_VERIFIED",
      amountMinor: 500,
      currency: "USD",
      occurredAt: "2026-10-09T12:00:00.000Z",
    });
    expect(outcome.recorded).toBe(false);
    expect(await ledger.capturedMinor()).toBe(0);
  });

  it("rejects a negative amount", async () => {
    const ledger = new SpendingLedger(new InMemorySpendingStore());
    const outcome = await ledger.record(event("CAPTURE_VERIFIED", -500, { id: "neg" }));
    expect(outcome.recorded).toBe(false);
  });

  it("rejects an unknown event kind", async () => {
    const ledger = new SpendingLedger(new InMemorySpendingStore());
    const outcome = await ledger.record({ ...event("PROPOSED", 100), kind: "NONSENSE" });
    expect(outcome.recorded).toBe(false);
  });
});

// --- reservations -----------------------------------------------------------

describe("reservations hold budget without counting as spending (5.4)", () => {
  it("tracks a reservation as committed, not captured", () => {
    const events = [event("RESERVED", 2000, { id: "res1" })];
    const summary = summarizeSpending(events);
    expect(summary.capturedMinor).toBe(0);
    expect(summary.reservedMinor).toBe(2000);
    expect(summary.committedMinor).toBe(2000);
  });

  it("releases a reservation", () => {
    const events = [
      event("RESERVED", 2000, { id: "res1" }),
      event("RELEASED", 2000, { id: "rel1" }),
    ];
    const summary = summarizeSpending(events);
    expect(summary.reservedMinor).toBe(0);
    expect(summary.committedMinor).toBe(0);
  });

  it("clamps reservations at zero if a release exceeds its reservation", () => {
    const events = [event("RELEASED", 500, { id: "rel-only" })];
    expect(summarizeSpending(events).reservedMinor).toBe(0);
  });
});

// --- period boundaries ------------------------------------------------------

describe("monthly period boundaries (11.2)", () => {
  it("includes the start instant and excludes the end instant", () => {
    const events = [
      event("CAPTURE_VERIFIED", 100, {
        id: "at-start",
        providerRef: "CAP-S",
        occurredAt: OCTOBER.startIso,
      }),
      event("CAPTURE_VERIFIED", 200, {
        id: "at-end",
        providerRef: "CAP-E",
        occurredAt: OCTOBER.endIso,
      }),
    ];
    expect(capturedMinorIn(events, OCTOBER)).toBe(100);
  });

  it("totals only captures inside the requested period", () => {
    const events = [
      event("CAPTURE_VERIFIED", 500, {
        id: "sept",
        providerRef: "CAP-SEP",
        occurredAt: "2026-09-30T23:59:59.000Z",
      }),
      event("CAPTURE_VERIFIED", 700, {
        id: "oct",
        providerRef: "CAP-OCT",
        occurredAt: "2026-10-15T00:00:00.000Z",
      }),
    ];
    expect(capturedMinorIn(events, OCTOBER)).toBe(700);
  });
});

// --- monthly period (decided: UTC calendar month) ---------------------------

describe("utcMonthPeriod", () => {
  it("returns the UTC calendar month containing the instant", () => {
    expect(utcMonthPeriod("2026-10-09T12:00:00.000Z")).toEqual({
      startIso: "2026-10-01T00:00:00.000Z",
      endIso: "2026-11-01T00:00:00.000Z",
    });
  });

  it("rolls December into January of the next year", () => {
    expect(utcMonthPeriod("2026-12-31T23:59:59.999Z")).toEqual({
      startIso: "2026-12-01T00:00:00.000Z",
      endIso: "2027-01-01T00:00:00.000Z",
    });
  });

  it("includes the first instant and excludes the first instant of the next month", () => {
    const october = utcMonthPeriod("2026-10-15T00:00:00.000Z");
    const atStart = event("CAPTURE_VERIFIED", 100, {
      id: "s",
      providerRef: "CAP-S",
      occurredAt: "2026-10-01T00:00:00.000Z",
    });
    const atEnd = event("CAPTURE_VERIFIED", 900, {
      id: "e",
      providerRef: "CAP-E",
      occurredAt: "2026-11-01T00:00:00.000Z",
    });
    expect(capturedMinorIn([atStart, atEnd], october)).toBe(100);
  });

  it("throws on an invalid instant rather than guessing a period", () => {
    expect(() => utcMonthPeriod("not-a-date")).toThrow();
  });
});

// --- the trust-mode marker (16 oct 2026) -------------------------------------

describe("AUTO_APPROVED marker", () => {
  it("is accepted by the ledger and counts as nothing spent", async () => {
    const ledger = new SpendingLedger(new InMemorySpendingStore());
    const outcome = await ledger.record(
      event("AUTO_APPROVED", 500, { id: "auto-approved:req-1" }),
    );
    expect(outcome.recorded).toBe(true);
    expect(await ledger.capturedMinor()).toBe(0);
  });

  it("is not a reservation either: the marker is pure history", () => {
    const summary = summarizeSpending([event("AUTO_APPROVED", 500, { id: "a" })]);
    expect(summary.capturedMinor).toBe(0);
    expect(summary.reservedMinor).toBe(0);
    expect(summary.committedMinor).toBe(0);
  });
});

// --- durability is a property of the store, not the logic -------------------

describe("state is reconstructed from persisted events (design for 11.2)", () => {
  it("rebuilds the same total from the stored events after a fresh read", async () => {
    // A durable store would persist these bytes; the ledger derives totals from
    // events rather than from an in-memory counter, so a reload is lossless.
    const store = new InMemorySpendingStore();
    const ledger = new SpendingLedger(store);
    await ledger.record(event("CAPTURE_VERIFIED", 500, { id: "c1", providerRef: "CAP-1" }));
    await ledger.record(event("CAPTURE_VERIFIED", 300, { id: "c2", providerRef: "CAP-2" }));

    const reread = new SpendingLedger(store); // simulate a fresh process on the same data
    expect(await reread.capturedMinor()).toBe(800);
  });
});
