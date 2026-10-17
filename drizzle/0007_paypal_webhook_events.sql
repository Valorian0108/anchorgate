-- PayPal webhook proof table (17 oct 2026): stores PayPal's signed
-- notification that a capture completed, verified against PayPal's own
-- certificate before it is trusted, so a record page can show PayPal's word
-- alongside ours. Additive: a brand-new table, nothing existing changes.
CREATE TABLE IF NOT EXISTS "paypal_webhook_events" (
  "id" serial PRIMARY KEY,
  "transmission_id" text NOT NULL UNIQUE,
  "capture_id" text NOT NULL,
  "event_type" text NOT NULL,
  "resource" jsonb NOT NULL,
  "transmission" jsonb NOT NULL,
  "verified" boolean DEFAULT false NOT NULL,
  "verification" jsonb,
  "received_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paypal_webhook_events_capture_id_idx" ON "paypal_webhook_events" ("capture_id");--> statement-breakpoint
