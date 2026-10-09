CREATE TABLE "spending_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_version" text NOT NULL,
	"currency" text NOT NULL,
	"per_purchase_auto_limit_minor" bigint NOT NULL,
	"monthly_cap_minor" bigint NOT NULL,
	"permitted_categories" text[] NOT NULL,
	"require_approval_for_new_payee" boolean NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
