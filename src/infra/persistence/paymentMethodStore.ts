/**
 * Durable saved-payment-method store, backed by PostgreSQL.
 *
 * Stores the provider vault token server-side only. The token is never exposed
 * to the browser or logs. `provider_token_id` is UNIQUE in the database, so a
 * repeated enrollment callback cannot create duplicate rows.
 *
 * The store is constructed with the signed-in user's id and every query is
 * scoped to it, so one person can never reach another person's vault, even
 * when a caller passes a foreign owner id or guesses a method id.
 */

import { and, asc, desc, eq, ne } from "drizzle-orm";

import type { PaymentMethodStore, SavedPaymentMethod } from "../../core/payments";
import type { AppDatabase } from "./client";
import { toSavedPaymentMethod, toSavedPaymentMethodRow } from "./mappers";
import { savedPaymentMethods } from "./schema";

export class DrizzlePaymentMethodStore implements PaymentMethodStore {
  constructor(
    private readonly db: AppDatabase,
    private readonly ownerId: string,
  ) {}

  async save(method: SavedPaymentMethod): Promise<void> {
    // The scope wins over whatever the method claims: rows are always stamped
    // with this store's owner.
    const row = { ...toSavedPaymentMethodRow(method), ownerId: this.ownerId };
    await this.db.transaction(async (tx) => {
      // Keep at most one row per provider token, even if a fresh id is used.
      await tx
        .delete(savedPaymentMethods)
        .where(
          and(
            eq(savedPaymentMethods.providerTokenId, method.providerTokenId),
            ne(savedPaymentMethods.id, method.id),
          ),
        );
      await tx
        .insert(savedPaymentMethods)
        .values(row)
        .onConflictDoUpdate({
          target: savedPaymentMethods.id,
          set: {
            ownerId: row.ownerId,
            provider: row.provider,
            sourceType: row.sourceType,
            providerTokenId: row.providerTokenId,
            providerCustomerId: row.providerCustomerId,
            payerEmail: row.payerEmail,
            status: row.status,
            revokedAt: row.revokedAt,
          },
        });
    });
  }

  async getActive(ownerId: string): Promise<SavedPaymentMethod | null> {
    const [row] = await this.db
      .select()
      .from(savedPaymentMethods)
      .where(
        and(
          eq(savedPaymentMethods.ownerId, ownerId),
          eq(savedPaymentMethods.ownerId, this.ownerId),
          eq(savedPaymentMethods.status, "ACTIVE"),
        ),
      )
      .orderBy(desc(savedPaymentMethods.createdAt))
      .limit(1);
    return row ? toSavedPaymentMethod(row) : null;
  }

  async getById(id: string): Promise<SavedPaymentMethod | null> {
    const [row] = await this.db
      .select()
      .from(savedPaymentMethods)
      .where(
        and(
          eq(savedPaymentMethods.ownerId, this.ownerId),
          eq(savedPaymentMethods.id, id),
        ),
      );
    return row ? toSavedPaymentMethod(row) : null;
  }

  async list(ownerId: string): Promise<SavedPaymentMethod[]> {
    const rows = await this.db
      .select()
      .from(savedPaymentMethods)
      .where(
        and(
          eq(savedPaymentMethods.ownerId, ownerId),
          eq(savedPaymentMethods.ownerId, this.ownerId),
        ),
      )
      .orderBy(asc(savedPaymentMethods.createdAt));
    return rows.map(toSavedPaymentMethod);
  }

  async revoke(id: string, revokedAt: string): Promise<boolean> {
    const updated = await this.db
      .update(savedPaymentMethods)
      .set({ status: "REVOKED", revokedAt: new Date(revokedAt) })
      .where(
        and(
          eq(savedPaymentMethods.ownerId, this.ownerId),
          eq(savedPaymentMethods.id, id),
        ),
      )
      .returning({ id: savedPaymentMethods.id });
    return updated.length > 0;
  }
}
