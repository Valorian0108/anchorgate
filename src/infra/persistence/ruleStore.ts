/**
 * Durable spending-rules store, backed by PostgreSQL.
 *
 * The MVP keeps a single, global rule set in one row (id `active`). Saving
 * replaces that row, so there is always exactly one active rule set.
 */

import { eq } from "drizzle-orm";

import type { SpendingRules, SpendingRulesStore } from "../../core/authorization";
import type { AppDatabase } from "./client";
import { ACTIVE_RULES_ID, toRulesRow, toSpendingRules } from "./mappers";
import { spendingRules } from "./schema";

export class DrizzleSpendingRulesStore implements SpendingRulesStore {
  constructor(private readonly db: AppDatabase) {}

  async getActive(): Promise<SpendingRules | null> {
    const [row] = await this.db
      .select()
      .from(spendingRules)
      .where(eq(spendingRules.id, ACTIVE_RULES_ID));
    return row ? toSpendingRules(row) : null;
  }

  async save(rules: SpendingRules): Promise<void> {
    const row = toRulesRow(rules, new Date());
    await this.db
      .insert(spendingRules)
      .values(row)
      .onConflictDoUpdate({
        target: spendingRules.id,
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
