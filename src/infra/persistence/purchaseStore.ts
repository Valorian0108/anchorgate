/**
 * Durable purchase store, backed by PostgreSQL.
 *
 * Implements the core's `PurchaseStore` interface, so the approval lifecycle
 * code is unchanged: it talks to the same interface whether the store is
 * in-memory or a real database.
 */

import { asc, eq, inArray } from "drizzle-orm";

import type { PurchaseRecord, PurchaseStore, RequestStatus } from "../../core/purchases";
import type { AppDatabase } from "./client";
import { toEvaluationRows, toPurchaseRecord, toPurchaseRow } from "./mappers";
import { evaluations, purchaseRequests } from "./schema";

type PurchaseRow = typeof purchaseRequests.$inferSelect;
type EvaluationRow = typeof evaluations.$inferSelect;

export class DrizzlePurchaseStore implements PurchaseStore {
  constructor(private readonly db: AppDatabase) {}

  async save(record: PurchaseRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(purchaseRequests)
        .values(toPurchaseRow(record))
        .onConflictDoUpdate({
          target: purchaseRequests.id,
          set: {
            status: record.status,
            approvalBy: record.approval?.approvedBy ?? null,
            approvalAt: record.approval ? new Date(record.approval.approvedAt) : null,
            rejectionBy: record.rejection?.rejectedBy ?? null,
            rejectionAt: record.rejection ? new Date(record.rejection.rejectedAt) : null,
            rejectionReason: record.rejection?.reason ?? null,
          },
        });

      // Replace the evaluations with the record's current list. This keeps the
      // stored history exactly equal to the record's history.
      await tx.delete(evaluations).where(eq(evaluations.requestId, record.id));
      const rows = toEvaluationRows(record);
      if (rows.length > 0) {
        await tx.insert(evaluations).values(rows);
      }
    });
  }

  async getById(id: string): Promise<PurchaseRecord | null> {
    const [row] = await this.db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id));
    if (!row) {
      return null;
    }
    const evaluationRows = await this.db
      .select()
      .from(evaluations)
      .where(eq(evaluations.requestId, id))
      .orderBy(asc(evaluations.id));
    return toPurchaseRecord(row, evaluationRows);
  }

  async list(): Promise<PurchaseRecord[]> {
    const rows = await this.db
      .select()
      .from(purchaseRequests)
      .orderBy(asc(purchaseRequests.createdAt), asc(purchaseRequests.id));
    return this.withEvaluations(rows);
  }

  async listByStatus(status: RequestStatus): Promise<PurchaseRecord[]> {
    const rows = await this.db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.status, status))
      .orderBy(asc(purchaseRequests.createdAt), asc(purchaseRequests.id));
    return this.withEvaluations(rows);
  }

  private async withEvaluations(rows: PurchaseRow[]): Promise<PurchaseRecord[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);
    const evaluationRows = await this.db
      .select()
      .from(evaluations)
      .where(inArray(evaluations.requestId, ids))
      .orderBy(asc(evaluations.id));

    const byRequest = new Map<string, EvaluationRow[]>();
    for (const row of evaluationRows) {
      const list = byRequest.get(row.requestId) ?? [];
      list.push(row);
      byRequest.set(row.requestId, list);
    }

    return rows.map((row) => toPurchaseRecord(row, byRequest.get(row.id) ?? []));
  }
}
