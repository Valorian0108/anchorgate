/**
 * The curated catalog is the feed's honesty guarantee.
 *
 * These tests do not call a language model. They pin the properties that must
 * hold no matter what is wired to the feed later:
 *   - the pool is exactly the approved specimen's fourteen items, and every
 *     category is one a brand-new gate already permits;
 *   - picking is deterministic, repeats nothing within a pass through the
 *     deck, and reshuffles when the deck runs out;
 *   - a person's rules filter the pool, and empty permission means silence;
 *   - surfacing files the pool item VERBATIM through the real engine, so
 *     under Option 1 it comes back ASK and lands as a real pending request,
 *     and even the catalog cannot ride over the hard monthly cap.
 */

import { describe, expect, it } from "vitest";

import {
  InMemorySpendingRulesStore,
  ReasonCode,
  type SpendingRules,
} from "../core/authorization";
import { InMemoryPurchaseStore } from "../core/purchases";
import { InMemorySpendingStore } from "../core/spending";
import { STARTING_CATEGORIES } from "../lib/rulesEdit";
import {
  CATALOG,
  CATALOG_AGENT_ID,
  catalogForCategories,
  pickNextCatalogItem,
  surfaceCatalogPurchase,
} from "./catalog";
import { ProposalService } from "./proposal";

const NOW = new Date("2026-10-12T12:00:00.000Z");

/** The product default (Option 1): auto-approve OFF, every request needs you. */
const RULES: SpendingRules = {
  ruleVersion: "test-1",
  currency: "USD",
  perPurchaseAutoLimitMinor: 1000, // dormant while auto-approve is off
  monthlyCapMinor: 20000, // $200.00 hard cap
  permittedCategories: [...STARTING_CATEGORIES],
  requireApprovalForNewPayee: true,
  autoApproveEnabled: false,
};

function makeService(rules: SpendingRules | null = RULES) {
  const purchases = new InMemoryPurchaseStore();
  const spending = new InMemorySpendingStore();
  let counter = 0;
  const service = new ProposalService({
    rules: new InMemorySpendingRulesStore(rules),
    purchases,
    spending,
    agentId: CATALOG_AGENT_ID,
    now: () => NOW,
    newId: () => `req-${++counter}`,
  });
  return { service, purchases };
}

/** Deal a whole pass of the deck for one seed, starting at `from`. */
function deal(seed: string, count: number, categories: readonly string[] = RULES.permittedCategories) {
  return Array.from({ length: count }, (_, i) =>
    pickNextCatalogItem({ seed, permittedCategories: categories, proposedCount: i }),
  );
}

describe("the pool", () => {
  it("is exactly the approved fourteen items", () => {
    expect(CATALOG).toHaveLength(14);
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(14);
  });

  it("stays inside the established categories", () => {
    for (const item of CATALOG) {
      expect(STARTING_CATEGORIES).toContain(item.category);
    }
  });

  it("carries clean positive USD money and real-sounding names", () => {
    for (const item of CATALOG) {
      expect(Number.isSafeInteger(item.amountMinor)).toBe(true);
      expect(item.amountMinor).toBeGreaterThan(0);
      expect(item.currency).toBe("USD");
      expect(item.payee.trim().length).toBeGreaterThan(0);
      expect(item.purpose.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("catalogForCategories", () => {
  it("keeps only permitted categories", () => {
    const books = catalogForCategories(["books"]);
    expect(books).toHaveLength(1);
    expect(books[0]?.id).toBe("the-pragmatic-programmer");
  });

  it("returns an empty deck when nothing is permitted", () => {
    expect(catalogForCategories([])).toHaveLength(0);
  });
});

describe("pickNextCatalogItem", () => {
  it("is deterministic: same person, same rules, same count, same item", () => {
    const a = pickNextCatalogItem({ seed: "user-1", permittedCategories: RULES.permittedCategories, proposedCount: 3 });
    const b = pickNextCatalogItem({ seed: "user-1", permittedCategories: RULES.permittedCategories, proposedCount: 3 });
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
  });

  it("repeats nothing within one pass through the deck", () => {
    const firstPass = deal("user-1", CATALOG.length);
    const ids = firstPass.map((i) => i?.id);
    expect(new Set(ids).size).toBe(CATALOG.length);
    expect(ids.every((id) => id !== null)).toBe(true);
  });

  it("covers the whole permitted deck over one pass", () => {
    const books = deal("user-1", 1, ["books"]);
    expect(books[0]?.id).toBe("the-pragmatic-programmer");

    const full = deal("user-1", CATALOG.length);
    const dealt = new Set(full.map((i) => i?.id));
    for (const item of CATALOG) expect(dealt.has(item.id)).toBe(true);
  });

  it("reshuffles when the deck runs out, still without repeats in a pass", () => {
    const firstPass = deal("user-1", CATALOG.length).map((i) => i?.id);
    const deck = catalogForCategories(RULES.permittedCategories);
    const secondPass = Array.from({ length: CATALOG.length }, (_, k) =>
      pickNextCatalogItem({
        seed: "user-1",
        permittedCategories: RULES.permittedCategories,
        proposedCount: CATALOG.length + k,
      })?.id,
    );
    // Still a full permutation (no repeats)...
    expect(new Set(secondPass).size).toBe(deck.length);
    // ...but a different order, so the feed never looks like a stuck record.
    expect(secondPass.some((id, k) => id !== firstPass[k])).toBe(true);
  });

  it("deals different people different decks", () => {
    const a = deal("user-1", CATALOG.length).map((i) => i?.id);
    const b = deal("user-2", CATALOG.length).map((i) => i?.id);
    expect(a.some((id, k) => id !== b[k])).toBe(true);
  });

  it("stays silent when the rules permit nothing", () => {
    expect(
      pickNextCatalogItem({ seed: "user-1", permittedCategories: [], proposedCount: 0 }),
    ).toBeNull();
  });
});

describe("surfaceCatalogPurchase", () => {
  it("files nothing when the person has no rules", async () => {
    const { service, purchases } = makeService(null);
    const result = await surfaceCatalogPurchase({
      proposals: service,
      seed: "user-1",
      proposedCount: 0,
    });
    expect(result).toBeNull();
    expect(await purchases.list()).toHaveLength(0);
  });

  it("files the pool item verbatim, and under Option 1 the engine ASKs", async () => {
    const { service, purchases } = makeService({ ...RULES, permittedCategories: ["books"] });
    const result = await surfaceCatalogPurchase({
      proposals: service,
      seed: "user-1",
      proposedCount: 0,
    });

    const expected = pickNextCatalogItem({
      seed: "user-1",
      permittedCategories: ["books"],
      proposedCount: 0,
    });
    expect(expected?.id).toBe("the-pragmatic-programmer");

    expect(result).not.toBeNull();
    expect(result?.decision.decision).toBe("ASK");
    expect(result?.decision.reasonCode).toBe(ReasonCode.APPROVAL_REQUIRED);
    expect(result?.record?.status).toBe("PENDING_APPROVAL");

    const request = result?.record?.request;
    expect(request?.payee).toBe(expected?.payee);
    expect(request?.purpose).toBe(expected?.purpose);
    expect(request?.category).toBe(expected?.category);
    expect(request?.amountMinor).toBe(expected?.amountMinor);
    expect(request?.currency).toBe("USD");
    expect(request?.agentId).toBe(CATALOG_AGENT_ID);

    // The request is durable: a real record any screen can open.
    const saved = await purchases.getById(result!.record!.id);
    expect(saved?.request.payee).toBe(expected?.payee);
  });

  it("cannot ride over the hard monthly cap: the engine still rules", async () => {
    const { service } = makeService({
      ...RULES,
      permittedCategories: ["books"],
      monthlyCapMinor: 500, // $5.00: the $41 book is over it
    });
    const result = await surfaceCatalogPurchase({
      proposals: service,
      seed: "user-1",
      proposedCount: 0,
    });
    expect(result?.decision.decision).toBe("DENY");
    expect(result?.decision.reasonCode).toBe(ReasonCode.MONTHLY_CAP_EXCEEDED);
  });
});
