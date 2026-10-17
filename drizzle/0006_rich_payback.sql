-- Trust mode (owner decision, 16 oct 2026): three ADDITIVE columns on
-- spending_rules, each with the safe default, so the live site keeps running
-- the old code against the new schema with zero behavior change: the toggle
-- stays off, the list stays empty, the auto budget stays zero.
--
-- NOTE: drizzle-kit generated the draft of this file against the 0003 metadata
-- snapshot (0004 and 0005 were hand-written and have no snapshots), so the
-- draft wrongly re-applied the owner_id work from 0005. It was hand-trimmed to
-- exactly the three new columns below. The accompanying 0006_snapshot.json is
-- correct and describes the full current schema, so future `db:generate` runs
-- diff against it cleanly.

ALTER TABLE "spending_rules" ADD COLUMN "auto_approve_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "spending_rules" ADD COLUMN "auto_allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "spending_rules" ADD COLUMN "auto_budget_minor" bigint DEFAULT 0 NOT NULL;
