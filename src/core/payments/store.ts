/**
 * Saved payment method storage.
 *
 * Like the other core stores, this is an interface so the domain logic is
 * unchanged whether the backing store is in-memory (tests) or PostgreSQL (app).
 *
 * `save` is idempotent per `providerTokenId` so a repeated enrollment callback
 * cannot create duplicates.
 */

import type { SavedPaymentMethod } from "./types";

export interface PaymentMethodStore {
  /** Insert or update by `providerTokenId`. */
  save(method: SavedPaymentMethod): Promise<void>;
  /** The single active method for an owner, if one is enrolled. */
  getActive(ownerId: string): Promise<SavedPaymentMethod | null>;
  getById(id: string): Promise<SavedPaymentMethod | null>;
  list(ownerId: string): Promise<SavedPaymentMethod[]>;
  /** Mark a method revoked. Returns whether a matching row existed. */
  revoke(id: string, revokedAt: string): Promise<boolean>;
}

/** In-memory implementation for tests and local development. Not durable. */
export class InMemoryPaymentMethodStore implements PaymentMethodStore {
  private readonly byId = new Map<string, SavedPaymentMethod>();

  async save(method: SavedPaymentMethod): Promise<void> {
    // Idempotent per provider token id: replace any existing row with the same
    // token, then ensure only one entry per id.
    for (const [id, existing] of this.byId) {
      if (existing.providerTokenId === method.providerTokenId && id !== method.id) {
        this.byId.delete(id);
      }
    }
    this.byId.set(method.id, method);
  }

  async getActive(ownerId: string): Promise<SavedPaymentMethod | null> {
    const active = [...this.byId.values()]
      .filter((m) => m.ownerId === ownerId && m.status === "ACTIVE")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return active[active.length - 1] ?? null;
  }

  async getById(id: string): Promise<SavedPaymentMethod | null> {
    return this.byId.get(id) ?? null;
  }

  async list(ownerId: string): Promise<SavedPaymentMethod[]> {
    return [...this.byId.values()]
      .filter((m) => m.ownerId === ownerId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async revoke(id: string, revokedAt: string): Promise<boolean> {
    const existing = this.byId.get(id);
    if (!existing) {
      return false;
    }
    this.byId.set(id, { ...existing, status: "REVOKED", revokedAt });
    return true;
  }
}
