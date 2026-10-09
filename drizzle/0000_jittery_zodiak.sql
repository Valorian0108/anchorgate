CREATE TABLE "evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"context" text NOT NULL,
	"decision" text NOT NULL,
	"reason_code" text NOT NULL,
	"reason" text NOT NULL,
	"rule_version" text NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"payee" text NOT NULL,
	"purpose" text NOT NULL,
	"category" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"approval_by" text,
	"approval_at" timestamp with time zone,
	"rejection_by" text,
	"rejection_at" timestamp with time zone,
	"rejection_reason" text
);
--> statement-breakpoint
CREATE TABLE "spending_events" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"provider_ref" text,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluations_request_id_idx" ON "evaluations" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "spending_events_request_id_idx" ON "spending_events" USING btree ("request_id");