/**
 * The curated purchase catalog (Phase 1c).
 *
 * The owner's product model: the feed only ever surfaces REAL, categorised
 * items that live in code. Nothing is invented, ever. The fourteen items below
 * are the approved v3 specimen's pool verbatim
 * (`design-research/live-instrument.specimen.v3.html`): realistic small-team
 * purchases, each tagged to one of the categories a brand-new gate starts
 * with, so a fresh account's feed works on day one.
 *
 * Picking is deterministic and stored nowhere: the deck is a seeded shuffle of
 * the items the person's rules permit, dealt one at a time by how many
 * catalog proposals they already have, and reshuffled each time the deck runs
 * out. Same person, same rules, same count means the same item, every time.
 *
 * Surfaced items are filed through the same `ProposalService` as everything
 * else, so the deterministic engine rules on them (under Option 1 that means
 * ASK: every one needs the owner) and the ledger records a real request. The
 * catalog cannot approve, cannot pay, and cannot widen any rule.
 */

import type { ProposalResult, ProposalService } from "./proposal";

/** One real item the feed may surface. */
export interface CatalogItem {
  /** Stable id, for keys and rotation. */
  id: string;
  /** Who would be paid, recorded verbatim as the request's payee. */
  payee: string;
  /** What the purchase is for, in the owner's words. */
  purpose: string;
  /** Must be one of the established categories (see STARTING_CATEGORIES). */
  category: string;
  /** Price as an integer in minor units (cents). */
  amountMinor: number;
  /** The whole product runs on USD, matching the sandbox. */
  currency: "USD";
}

/**
 * Recorded as the proposing `agentId` on catalog-sourced requests, so they
 * stay distinguishable from typed asks ("ai-agent") and every screen can say
 * honestly where a proposal came from. Callers count records with this id to
 * feed `proposedCount`.
 */
export const CATALOG_AGENT_ID = "catalog";

/** The approved pool. Add items only within the established categories. */
export const CATALOG: readonly CatalogItem[] = [
  { id: "vercel-pro", payee: "Vercel Pro", purpose: "monthly plan", category: "cloud_services", amountMinor: 2000, currency: "USD" },
  { id: "figma-professional", payee: "Figma Professional", purpose: "editor seat", category: "software", amountMinor: 1500, currency: "USD" },
  { id: "notion-team", payee: "Notion Team", purpose: "workspace", category: "software", amountMinor: 1000, currency: "USD" },
  { id: "aws", payee: "AWS", purpose: "monthly usage", category: "cloud_services", amountMinor: 4200, currency: "USD" },
  { id: "onepassword", payee: "1Password", purpose: "team plan", category: "software", amountMinor: 800, currency: "USD" },
  { id: "blue-bottle-coffee", payee: "Blue Bottle coffee", purpose: "office subscription", category: "meals", amountMinor: 1800, currency: "USD" },
  { id: "bakery-order", payee: "Bakery order", purpose: "team breakfast", category: "meals", amountMinor: 2400, currency: "USD" },
  { id: "usb-c-hub", payee: "USB-C hub", purpose: "new laptop dock", category: "hardware", amountMinor: 3900, currency: "USD" },
  { id: "external-ssd-1tb", payee: "External SSD 1TB", purpose: "backups", category: "hardware", amountMinor: 8900, currency: "USD" },
  { id: "printer-paper", payee: "Printer paper", purpose: "restock", category: "office_supplies", amountMinor: 2200, currency: "USD" },
  { id: "monitor-arm", payee: "Monitor arm", purpose: "desk setup", category: "office_supplies", amountMinor: 5400, currency: "USD" },
  { id: "the-pragmatic-programmer", payee: "The Pragmatic Programmer", purpose: "team copy", category: "books", amountMinor: 4100, currency: "USD" },
  { id: "google-ads-top-up", payee: "Google Ads top-up", purpose: "campaign budget", category: "advertising", amountMinor: 6000, currency: "USD" },
  { id: "flight-team-offsite", payee: "Flight · team offsite", purpose: "one seat", category: "travel", amountMinor: 12000, currency: "USD" },
];

/** The items a person's rules permit. An empty list means an empty deck. */
export function catalogForCategories(
  permittedCategories: readonly string[],
): CatalogItem[] {
  return CATALOG.filter((item) => permittedCategories.includes(item.category));
}

/**
 * A small deterministic string hash (FNV-style, 32-bit). Fixed seeds must
 * produce fixed shuffles across processes, machines, and runs, so this never
 * uses Math.random.
 */
function hashSeed(text: string): number {
  let h = 1779033703;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

/** Fisher-Yates shuffle driven by a seeded 32-bit generator (mulberry32). */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0;
  const rand = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    // Both indices are in bounds by construction; the guards only satisfy the
    // strict index-access types.
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * The next item for one person's feed, or null when their rules permit none.
 *
 * `proposedCount` is how many catalog-sourced requests they already have (the
 * caller counts records whose `agentId` is `CATALOG_AGENT_ID`). Within one
 * pass through the deck no item repeats; when the deck runs out it reshuffles
 * with the cycle number mixed into the seed, so the feed loops without dying
 * and without looking like a stuck record.
 */
export function pickNextCatalogItem(opts: {
  /** Stable per-person seed (their user id), so decks differ between people. */
  seed: string;
  permittedCategories: readonly string[];
  proposedCount: number;
}): CatalogItem | null {
  const deck = catalogForCategories(opts.permittedCategories);
  if (deck.length === 0) return null;

  const count = Math.max(0, Math.floor(opts.proposedCount));
  const cycle = Math.floor(count / deck.length);
  const index = count % deck.length;
  return shuffle(deck, hashSeed(`${opts.seed}:${cycle}`))[index] ?? null;
}

/**
 * The shortest gap between two arrivals for one person.
 *
 * The Gate asks the feed for the next item about every thirty seconds, but the
 * feed is not a firehose: this window is the real cadence, enforced on the
 * server. Reloading the Gate, opening a second tab, or a timer that fires a
 * touch early can never file two requests back to back, because a request
 * within this window of the last one is simply not due yet.
 */
export const CATALOG_ARRIVAL_GAP_MS = 20_000;

/**
 * A person's catalog history, derived from their records and stored nowhere:
 * how many catalog-sourced requests they have, and when the most recent one
 * arrived. Only the fields this needs are read, so it composes over anything
 * that looks like a record.
 */
export function catalogState(
  records: readonly {
    request: { agentId: string };
    createdAt: string;
  }[],
): { proposedCount: number; lastArrivalAt: string | null } {
  let proposedCount = 0;
  let lastArrivalAt: string | null = null;
  for (const record of records) {
    if (record.request.agentId !== CATALOG_AGENT_ID) continue;
    proposedCount += 1;
    if (lastArrivalAt === null || record.createdAt > lastArrivalAt) {
      lastArrivalAt = record.createdAt;
    }
  }
  return { proposedCount, lastArrivalAt };
}

/**
 * Is the next arrival due? Nothing yet means yes. Anything inside the gap
 * since the last arrival means no. This is what makes the feed occasional and
 * makes reloads idempotent.
 */
export function catalogArrivalDue(opts: {
  lastArrivalAt: string | null;
  nowMs: number;
  gapMs?: number;
}): boolean {
  if (opts.lastArrivalAt === null) return true;
  const last = new Date(opts.lastArrivalAt).getTime();
  if (Number.isNaN(last)) return true;
  const gap = opts.gapMs ?? CATALOG_ARRIVAL_GAP_MS;
  return opts.nowMs - last >= gap;
}

/**
 * The most requests the feed will leave waiting on the owner before it holds
 * back. The point of the gate is a decision that stays human: if the owner is
 * already behind on several, piling on more is noise, not a feed. Arrivals
 * resume as soon as they work through them.
 */
export const CATALOG_MAX_WAITING_ON_YOU = 4;

/**
 * Should the feed hold back? Yes when the owner already has this many requests
 * waiting on their okay. Reads only a record's status, so it composes over
 * anything that looks like a record.
 */
export function catalogShouldHoldBack(
  records: readonly { status: string }[],
): boolean {
  let waiting = 0;
  for (const record of records) {
    if (record.status === "PENDING_APPROVAL") waiting += 1;
  }
  return waiting >= CATALOG_MAX_WAITING_ON_YOU;
}

/**
 * Surface the next catalog item as a real purchase request.
 *
 * Composition only: read the person's active rules, pick from the pool, and
 * hand the item VERBATIM to the `ProposalService`, which runs the
 * deterministic engine and persists the record. Returns null, filing nothing,
 * when no rules are set or no item is permitted: silence is honest, the feed
 * simply has nothing to post. This function cannot invent a request and
 * cannot bypass a rule.
 */
export async function surfaceCatalogPurchase(deps: {
  proposals: ProposalService;
  /** The person's user id. */
  seed: string;
  /** How many catalog-sourced requests they already have. */
  proposedCount: number;
}): Promise<ProposalResult | null> {
  const rules = await deps.proposals.activeRules();
  if (!rules) return null;

  const item = pickNextCatalogItem({
    seed: deps.seed,
    permittedCategories: rules.permittedCategories,
    proposedCount: deps.proposedCount,
  });
  if (!item) return null;

  return deps.proposals.propose({
    payee: item.payee,
    purpose: item.purpose,
    category: item.category,
    amountMinor: item.amountMinor,
    currency: item.currency,
  });
}
