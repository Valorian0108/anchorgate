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
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import type { AutoAllowlistEntry } from "../../core/authorization";

/**
 * One proposed purchase and its current lifecycle state.
 *
 * The request's material details are immutable; only the lifecycle columns
 * (status, approval, rejection) change after creation.
 */
export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: text("id").primaryKey(),
    /** Supabase auth user id of the person this request belongs to. */
    ownerId: text("owner_id").notNull(),
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
  },
  (table) => [index("purchase_requests_owner_idx").on(table.ownerId)],
);

/**
 * The authorization evaluations recorded for a request, oldest first.
 * Child rows of `purchase_requests`; deleted if the parent is deleted.
 */
export const evaluations = pgTable(
  "evaluations",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
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
  (table) => [
    index("evaluations_request_id_idx").on(table.requestId),
    index("evaluations_owner_idx").on(table.ownerId),
  ],
);

/**
 * The spending ledger. `id` is the idempotency key (for a verified capture it is
 * derived from the provider capture id).
 */
export const spendingEvents = pgTable(
  "spending_events",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    requestId: text("request_id").notNull(),
    kind: text("kind").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
    providerRef: text("provider_ref"),
    note: text("note"),
  },
  (table) => [
    index("spending_events_request_id_idx").on(table.requestId),
    index("spending_events_owner_idx").on(table.ownerId),
  ],
);

/**
 * The active spending rules, one row per person.
 *
 * Each signed-in user has their own rule set, stored as the row
 * (owner_id, "active"). Missing rules fail safe: nothing can be approved.
 */
export const spendingRules = pgTable(
  "spending_rules",
  {
    ownerId: text("owner_id").notNull(),
    id: text("id").notNull(),
    ruleVersion: text("rule_version").notNull(),
    currency: text("currency").notNull(),
    perPurchaseAutoLimitMinor: bigint("per_purchase_auto_limit_minor", {
      mode: "number",
    }).notNull(),
    monthlyCapMinor: bigint("monthly_cap_minor", { mode: "number" }).notNull(),
    permittedCategories: text("permitted_categories").array().notNull(),
    requireApprovalForNewPayee: boolean("require_approval_for_new_payee").notNull(),
    /**
     * Trust mode (owner decision, 16 oct 2026). The toggle ships OFF; the
     * column default keeps every existing and future row off until the owner
     * switches it on from the Rules page.
     */
    autoApproveEnabled: boolean("auto_approve_enabled").notNull().default(false),
    /** The owner's exact-price trust list. Empty means nothing auto-clears. */
    autoAllowlist: jsonb("auto_allowlist").notNull().$type<AutoAllowlistEntry[]>().default([]),
    /** Monthly ceiling for automatic spending, under the hard cap. 0 auto-pays nothing. */
    autoBudgetMinor: bigint("auto_budget_minor", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.id] })],
);

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

/**
 * PayPal's signed notification that a capture completed.
 *
 * PayPal sends webhooks to this app; each one is verified against PayPal's own
 * public certificate before it is trusted, and stored so a record page can show
 * PayPal's word alongside ours. `transmission_id` is the idempotency key: the
 * same notification delivered twice is stored once.
 */
export const paypalWebhookEvents = pgTable(
  "paypal_webhook_events",
  {
    id: serial("id").primaryKey(),
    /** PayPal's transmission id; idempotency key for repeated deliveries. */
    transmissionId: text("transmission_id").notNull().unique(),
    /** The capture id the notification is about, matched to our record. */
    captureId: text("capture_id").notNull(),
    eventType: text("event_type").notNull(),
    resource: jsonb("resource").notNull(),
    /** The transmission headers PayPal sent with the webhook. */
    transmission: jsonb("transmission").notNull(),
    /** Whether PayPal's verification API confirmed the signature. */
    verified: boolean("verified").notNull().default(false),
    verification: jsonb("verification"),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("paypal_webhook_events_capture_id_idx").on(table.captureId)],
);
