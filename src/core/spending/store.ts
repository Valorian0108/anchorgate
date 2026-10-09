/**
 * Storage for spending events.
 *
 * Like the purchase store, this is an INTERFACE rather than a database. It
 * defines the shape the accounting logic needs, so the logic stays pure and
 * testable and a real datastore can be plugged in later.
 *
 * `append` is the idempotency point: it MUST reject an event whose `id` already
 * exists. That is what guarantees a duplicate callback cannot create duplicate
 * spending records.
 */

import type { SpendingEvent } from "./types";

export interface SpendingStore {
  /**
   * Append an event. Returns `true` if it was stored, or `false` if an event
   * with the same id already exists (an idempotent no-op).
   */
  append(event: SpendingEvent): Promise<boolean>;
  /** All events, oldest first. */
  list(): Promise<SpendingEvent[]>;
  /** All events belonging to one purchase request, oldest first. */
  listByRequest(requestId: string): Promise<SpendingEvent[]>;
}

/**
 * A simple in-memory store for tests and local development.
 *
 * NOT durable: events are lost on restart, so it does not satisfy the spec's
 * durability requirement on its own. It exists to exercise the accounting logic
 * and prove the interface. A real datastore replaces it without changing the
 * domain code.
 */
export class InMemorySpendingStore implements SpendingStore {
  private readonly events = new Map<string, SpendingEvent>();

  async append(event: SpendingEvent): Promise<boolean> {
    if (this.events.has(event.id)) {
      return false;
    }
    this.events.set(event.id, event);
    return true;
  }

  async list(): Promise<SpendingEvent[]> {
    return [...this.events.values()];
  }

  async listByRequest(requestId: string): Promise<SpendingEvent[]> {
    return [...this.events.values()].filter((event) => event.requestId === requestId);
  }
}
