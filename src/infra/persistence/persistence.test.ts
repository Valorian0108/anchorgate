/**
 * Persistence tests (Phase 3).
 *
 * These run against a REAL PostgreSQL engine in-process (PGlite), applying the
 * same migrations the app uses. That gives us honest evidence about the SQL,
 * the constraints, and durability — without needing the cloud database.
 *
 * A separate test proves state survives a process restart by using a
 * filesystem-backed database and reopening it.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SpendingRules, SpendingState } from "../../core/authorization";
import type { SavedPaymentMethod } from "../../core/payments";
import { approvePurchase, proposePurchase } from "../../core/purchases";
import type { PurchaseRequest } from "../../core/authorization";
import { captureEventId, SpendingLedger } from "../../core/spending";
import type { AppDatabase } from "./client";
import { DrizzlePaymentMethodStore } from "./paymentMethodStore";
import { DrizzlePurchaseStore } from "./purchaseStore";
import { DrizzleSpendingRulesStore } from "./ruleStore";
import { DrizzleSpendingStore } from "./spendingStore";
import * as schema from "./schema";

const MIGRATIONS = { migrationsFolder: "./drizzle" };

const RULES: SpendingRules = {
  ruleVersion: "v1",
  currency: "USD",
  perPurchaseAutoLimitMinor: 1000,
  monthlyCapMinor: 5000,
  permittedCategories: ["office", "books"],
  requireApprovalForNewPayee: false,
};

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

// --- shared in-memory Postgres for the main suite ---------------------------

let client: PGlite;
let db: AppDatabase;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, MIGRATIONS);
}, 30_000);

afterAll(async () => {
  await client.close();
});

// --- purchases --------------------------------------------------------------

describe("DrizzlePurchaseStore", () => {
  it("persists a record and reads it back with its evaluations", async () => {
    const store = new DrizzlePurchaseStore(db);
    const record = proposePurchase(request({ id: "p1" }), RULES, STATE, NOW).record!;
    await store.save(record);

    const loaded = await store.getById("p1");
    expect(loaded?.status).toBe("AUTHORIZED");
    expect(loaded?.request.amountMinor).toBe(500);
    expect(loaded?.evaluations).toHaveLength(1);
    expect(loaded?.evaluations[0]?.context).toBe("PROPOSAL");
  });

  it("persists an approval transition and its extra evaluation", async () => {
    const store = new DrizzlePurchaseStore(db);
    const pending = proposePurchase(request({ id: "p2", amountMinor: 1500 }), RULES, STATE, NOW)
      .record!;
    await store.save(pending);

    const approved = approvePurchase(pending, "owner@example.com", RULES, STATE, LATER).record;
    await store.save(approved);

    const loaded = await store.getById("p2");
    expect(loaded?.status).toBe("APPROVED");
    expect(loaded?.approval?.approvedBy).toBe("owner@example.com");
    expect(loaded?.evaluations.map((e) => e.context)).toEqual(["PROPOSAL", "APPROVAL"]);
  });

  it("filters by status", async () => {
    const store = new DrizzlePurchaseStore(db);
    const pending = await store.listByStatus("PENDING_APPROVAL");
    // p2 was approved; the only remaining pending is none of ours, so this is a
    // sanity check that filtering is applied.
    expect(pending.every((r) => r.status === "PENDING_APPROVAL")).toBe(true);
  });

  it("returns null for an unknown id", async () => {
    const store = new DrizzlePurchaseStore(db);
    expect(await store.getById("does-not-exist")).toBeNull();
  });
});

// --- spending (database-enforced idempotency) -------------------------------

describe("DrizzleSpendingStore", () => {
  it("records a verified capture and ignores the duplicate at the database level", async () => {
    const ledger = new SpendingLedger(new DrizzleSpendingStore(db));
    const capture = {
      id: captureEventId("CAP-DB-1"),
      requestId: "p1",
      kind: "CAPTURE_VERIFIED" as const,
      amountMinor: 500,
      currency: "USD",
      occurredAt: "2026-10-09T12:00:00.000Z",
      providerRef: "CAP-DB-1",
    };

    const first = await ledger.record(capture);
    const second = await ledger.record(capture);

    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
    expect(await ledger.capturedMinor()).toBe(500);
  });

  it("lists events for one request", async () => {
    const store = new DrizzleSpendingStore(db);
    const events = await store.listByRequest("p1");
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.every((e) => e.requestId === "p1")).toBe(true);
  });
});

// --- spending rules ---------------------------------------------------------

describe("DrizzleSpendingRulesStore", () => {
  it("returns null when no rules are configured", async () => {
    await db.delete(schema.spendingRules);
    const store = new DrizzleSpendingRulesStore(db);
    expect(await store.getActive()).toBeNull();
  });

  it("stores and reads back the active rules", async () => {
    const store = new DrizzleSpendingRulesStore(db);
    await store.save(RULES);
    expect(await store.getActive()).toEqual(RULES);
  });

  it("replaces the active rules on save (single global set)", async () => {
    const store = new DrizzleSpendingRulesStore(db);
    const updated: SpendingRules = { ...RULES, ruleVersion: "v2", monthlyCapMinor: 9000 };
    await store.save(updated);
    const loaded = await store.getActive();
    expect(loaded?.ruleVersion).toBe("v2");
    expect(loaded?.monthlyCapMinor).toBe(9000);
  });
});

// --- saved payment methods (vault tokens) -----------------------------------

function paymentMethod(
  overrides: Partial<SavedPaymentMethod> = {},
): SavedPaymentMethod {
  return {
    id: "pm-1",
    ownerId: "default",
    provider: "paypal",
    sourceType: "paypal",
    providerTokenId: "VAULT-1",
    payerEmail: "buyer@example.com",
    status: "ACTIVE",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("DrizzlePaymentMethodStore", () => {
  it("stores an active vaulted method and reads it back", async () => {
    const store = new DrizzlePaymentMethodStore(db);
    await store.save(paymentMethod());
    const active = await store.getActive("default");
    expect(active?.providerTokenId).toBe("VAULT-1");
    expect(active?.payerEmail).toBe("buyer@example.com");
    expect(active?.sourceType).toBe("paypal");
  });

  it("round-trips a card payment source", async () => {
    const store = new DrizzlePaymentMethodStore(db);
    await store.save(
      paymentMethod({ id: "pm-card", providerTokenId: "VAULT-CARD", sourceType: "card" }),
    );
    const loaded = await store.getById("pm-card");
    expect(loaded?.sourceType).toBe("card");
  });

  it("keeps a single row per provider token across repeated saves", async () => {
    const store = new DrizzlePaymentMethodStore(db);
    // A retry of enrollment uses a fresh id but the same provider token.
    await store.save(paymentMethod({ id: "pm-2", providerTokenId: "VAULT-2" }));
    await store.save(
      paymentMethod({ id: "pm-9", providerTokenId: "VAULT-2", payerEmail: "new@example.com" }),
    );
    const all = await store.list("default");
    expect(all.filter((m) => m.providerTokenId === "VAULT-2")).toHaveLength(1);
  });

  it("revokes a method so it is no longer active", async () => {
    const store = new DrizzlePaymentMethodStore(db);
    const saved = paymentMethod({ id: "pm-3", providerTokenId: "VAULT-3" });
    await store.save(saved);
    expect(await store.revoke("pm-3", "2026-10-05T00:00:00.000Z")).toBe(true);
    expect((await store.getById("pm-3"))?.status).toBe("REVOKED");
    const active = await store.list("default");
    expect(active.find((m) => m.id === "pm-3")?.revokedAt).toBe(
      "2026-10-05T00:00:00.000Z",
    );
  });

  it("returns null for an unknown id", async () => {
    const store = new DrizzlePaymentMethodStore(db);
    expect(await store.getById("nope")).toBeNull();
  });
});

// --- durability across a restart --------------------------------------------

describe("durability across restart", () => {
  it("keeps data when the database is closed and reopened", async () => {
    const dir = mkdtempSync(join(tmpdir(), "spend-authorizer-"));
    try {
      const first = new PGlite(dir);
      const firstDb: AppDatabase = drizzle(first, { schema });
      await migrate(firstDb, MIGRATIONS);
      await new DrizzleSpendingStore(firstDb).append({
        id: captureEventId("CAP-RESTART"),
        requestId: "p-restart",
        kind: "CAPTURE_VERIFIED",
        amountMinor: 700,
        currency: "USD",
        occurredAt: "2026-10-09T12:00:00.000Z",
        providerRef: "CAP-RESTART",
      });
      await first.close();

      // Reopen the same on-disk database, as a fresh process would.
      const second = new PGlite(dir);
      const secondDb: AppDatabase = drizzle(second, { schema });
      const events = await new DrizzleSpendingStore(secondDb).list();

      expect(events).toHaveLength(1);
      expect(events[0]?.amountMinor).toBe(700);
      await second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
