/**
 * Durable spending store, backed by PostgreSQL.
 *
 * Idempotency is enforced by the database: `spending_events.id` is the primary
 * key, and `append` inserts with `ON CONFLICT DO NOTHING`. A duplicate capture
 * (same key) therefore cannot create a second row, no matter how many times the
 * callback is retried.
 *
 * The store is constructed with the signed-in user's id: every event is
 * stamped with it on write, and every read is scoped to it.
 */

import { and, asc, eq } from "drizzle-orm";

import type { SpendingEvent, SpendingStore } from "../../core/spending";
import type { AppDatabase } from "./client";
import { toSpendingEvent, toSpendingRow } from "./mappers";
import { spendingEvents } from "./schema";

export class DrizzleSpendingStore implements SpendingStore {
  constructor(
    private readonly db: AppDatabase,
    private readonly ownerId: string,
  ) {}

  async append(event: SpendingEvent): Promise<boolean> {
    const inserted = await this.db
      .insert(spendingEvents)
      .values(toSpendingRow(event, this.ownerId))
      .onConflictDoNothing({ target: spendingEvents.id })
      .returning({ id: spendingEvents.id });
    return inserted.length > 0;
  }

  async list(): Promise<SpendingEvent[]> {
    const rows = await this.db
      .select()
      .from(spendingEvents)
      .where(eq(spendingEvents.ownerId, this.ownerId))
      .orderBy(asc(spendingEvents.occurredAt), asc(spendingEvents.id));
    return rows.map(toSpendingEvent);
  }

  async listByRequest(requestId: string): Promise<SpendingEvent[]> {
    const rows = await this.db
      .select()
      .from(spendingEvents)
      .where(
        and(
          eq(spendingEvents.ownerId, this.ownerId),
          eq(spendingEvents.requestId, requestId),
        ),
      )
      .orderBy(asc(spendingEvents.occurredAt), asc(spendingEvents.id));
    return rows.map(toSpendingEvent);
  }
}
