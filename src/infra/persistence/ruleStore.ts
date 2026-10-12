/**
 * Durable spending-rules store, backed by PostgreSQL.
 *
 * One active rule set PER PERSON: the store is constructed with the signed-in
 * user's id and only ever reads or writes that person's row (id `active`).
 * Saving replaces the row, so there is always exactly one active rule set per
 * user. Missing rules return `null`, which the engine treats as fail-safe.
 */

import { and, eq } from "drizzle-orm";

import type { SpendingRules, SpendingRulesStore } from "../../core/authorization";
import type { AppDatabase } from "./client";
import { ACTIVE_RULES_ID, toRulesRow, toSpendingRules } from "./mappers";
import { spendingRules } from "./schema";

export class DrizzleSpendingRulesStore implements SpendingRulesStore {
  constructor(
    private readonly db: AppDatabase,
    private readonly ownerId: string,
  ) {}

  async getActive(): Promise<SpendingRules | null> {
    const [row] = await this.db
      .select()
      .from(spendingRules)
      .where(
        and(
          eq(spendingRules.ownerId, this.ownerId),
          eq(spendingRules.id, ACTIVE_RULES_ID),
        ),
      );
    return row ? toSpendingRules(row) : null;
  }

  async save(rules: SpendingRules): Promise<void> {
    const row = toRulesRow(rules, new Date(), this.ownerId);
    await this.db
      .insert(spendingRules)
      .values(row)
      .onConflictDoUpdate({
        target: [spendingRules.ownerId, spendingRules.id],
        set: {
          ruleVersion: row.ruleVersion,
          currency: row.currency,
          perPurchaseAutoLimitMinor: row.perPurchaseAutoLimitMinor,
          monthlyCapMinor: row.monthlyCapMinor,
          permittedCategories: row.permittedCategories,
          requireApprovalForNewPayee: row.requireApprovalForNewPayee,
          updatedAt: row.updatedAt,
        },
      });
  }
}
