/**
 * Database schema (PostgreSQL / Supabase), defined with Drizzle ORM.
 *
 * This is the durable home for the domain data the core already models:
 *   - purchase requests and their authorization evaluations
 *   - spending events (the accounting ledger)
 *
 * The core stays pure. These tables are infrastructure; the stores in this
 * folder translate between rows and the core's domain types.
 *
 * Idempotency note: `spending_events.id` is the PRIMARY KEY. The database — not
 * application code — is what guarantees a duplicate capture cannot be recorded
 * twice.
 */

import {
  bigint,
  boolean,
  index,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * One proposed purchase and its current lifecycle state.
 *
 * The request's material details are immutable; only the lifecycle columns
 * (status, approval, rejection) change after creation.
 */
export const purchaseRequests = pgTable("purchase_requests", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  payee: text("payee").notNull(),
  purpose: text("purpose").notNull(),
  category: text("category").notNull(),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  /** SHA-256 over the material details; binds approvals. */
  fingerprint: text("fingerprint").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  approvalBy: text("approval_by"),
  approvalAt: timestamp("approval_at", { withTimezone: true, mode: "date" }),
  rejectionBy: text("rejection_by"),
  rejectionAt: timestamp("rejection_at", { withTimezone: true, mode: "date" }),
  rejectionReason: text("rejection_reason"),
});

/**
 * The authorization evaluations recorded for a request, oldest first.
 * Child rows of `purchase_requests`; deleted if the parent is deleted.
 */
export const evaluations = pgTable(
  "evaluations",
  {
    id: serial("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: "cascade" }),
    context: text("context").notNull(),
    decision: text("decision").notNull(),
    reasonCode: text("reason_code").notNull(),
    reason: text("reason").notNull(),
    ruleVersion: text("rule_version").notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("evaluations_request_id_idx").on(table.requestId)],
);

/**
 * The spending ledger. `id` is the idempotency key (for a verified capture it is
 * derived from the provider capture id).
 */
export const spendingEvents = pgTable(
  "spending_events",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    kind: text("kind").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
    providerRef: text("provider_ref"),
    note: text("note"),
  },
  (table) => [index("spending_events_request_id_idx").on(table.requestId)],
);

/**
 * The active spending rules.
 *
 * Single global rule set for the MVP, stored as one row with the fixed id
 * "active". The schema can grow a user/tenant id later.
 */
export const spendingRules = pgTable("spending_rules", {
  id: text("id").primaryKey(),
  ruleVersion: text("rule_version").notNull(),
  currency: text("currency").notNull(),
  perPurchaseAutoLimitMinor: bigint("per_purchase_auto_limit_minor", {
    mode: "number",
  }).notNull(),
  monthlyCapMinor: bigint("monthly_cap_minor", { mode: "number" }).notNull(),
  permittedCategories: text("permitted_categories").array().notNull(),
  requireApprovalForNewPayee: boolean("require_approval_for_new_payee").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
});

/**
 * The user's saved ("vaulted") payment methods.
 *
 * `provider_token_id` is the provider's vault/payment-token handle. It is a
 * sensitive secret: it is stored server-side only and must never be sent to the
 * browser or written to logs. It is UNIQUE so a repeated enrollment cannot
 * create duplicate rows.
 */
export const savedPaymentMethods = pgTable(
  "saved_payment_methods",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    provider: text("provider").notNull(),
    /**
     * Which provider payment source the token is for: "paypal" (wallet) or
     * "card". Existing rows default to "paypal" (the original enrollment type).
     */
    sourceType: text("source_type").notNull().default("paypal"),
    providerTokenId: text("provider_token_id").notNull().unique(),
    providerCustomerId: text("provider_customer_id"),
    payerEmail: text("payer_email"),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("saved_payment_methods_owner_idx").on(table.ownerId)],
);
