/**
 * Storage for purchase records.
 *
 * This is deliberately an INTERFACE, not a database. It defines the "shape" the
 * application needs, so the approval lifecycle stays pure and testable. A real
 * durable implementation (e.g. a database) can be dropped in later without
 * changing the domain code.
 *
 * The methods are async to match how a real datastore behaves.
 */

import type { PurchaseRecord, RequestStatus } from "./types";

export interface PurchaseStore {
  save(record: PurchaseRecord): Promise<void>;
  getById(id: string): Promise<PurchaseRecord | null>;
  list(): Promise<PurchaseRecord[]>;
  listByStatus(status: RequestStatus): Promise<PurchaseRecord[]>;
}

/**
 * A simple in-memory store. Useful for tests and local development.
 *
 * NOT durable: records are lost on restart. The spec requires durable storage
 * before the MVP is complete; this implementation exists to exercise the domain
 * logic and to prove the interface, not to satisfy that requirement.
 */
export class InMemoryPurchaseStore implements PurchaseStore {
  private readonly records = new Map<string, PurchaseRecord>();

  async save(record: PurchaseRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async getById(id: string): Promise<PurchaseRecord | null> {
    return this.records.get(id) ?? null;
  }

  async list(): Promise<PurchaseRecord[]> {
    return [...this.records.values()];
  }

  async listByStatus(status: RequestStatus): Promise<PurchaseRecord[]> {
    return [...this.records.values()].filter((record) => record.status === status);
  }
}
