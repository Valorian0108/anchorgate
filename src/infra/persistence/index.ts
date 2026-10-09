/**
 * Persistence infrastructure: the durable implementations of the core's store
 * interfaces, plus the Drizzle schema they share.
 */

export { createDatabase } from "./client";
export type { AppDatabase, DatabaseHandle } from "./client";
export { DrizzlePurchaseStore } from "./purchaseStore";
export { DrizzlePaymentMethodStore } from "./paymentMethodStore";
export { DrizzleSpendingRulesStore } from "./ruleStore";
export { DrizzleSpendingStore } from "./spendingStore";
export * as schema from "./schema";
