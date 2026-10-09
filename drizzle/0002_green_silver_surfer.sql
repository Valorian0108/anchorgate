CREATE TABLE "saved_payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_token_id" text NOT NULL,
	"provider_customer_id" text,
	"payer_email" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "saved_payment_methods_provider_token_id_unique" UNIQUE("provider_token_id")
);
--> statement-breakpoint
CREATE INDEX "saved_payment_methods_owner_idx" ON "saved_payment_methods" USING btree ("owner_id");