-- Per-user ownership: every row learns whose it is.
--
-- All five tables gain (or keep) an `owner_id` holding a Supabase auth user id.
-- Existing data belonged to the single owner account, so it is backfilled to
-- that account, looked up by email in `auth.users` when running on Supabase.
-- The email is the OWNER_EMAIL identity already present in the repository's
-- git metadata; it is an identifier, not a credential. On a plain PostgreSQL
-- (tests/PGlite) there is no `auth` schema and the tables start empty, so the
-- placeholder branch never writes a row.

ALTER TABLE "purchase_requests" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "spending_events" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "spending_rules" ADD COLUMN "owner_id" text;--> statement-breakpoint

DO $$
DECLARE
  uid text := NULL;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users'
  ) THEN
    EXECUTE 'SELECT id::text FROM auth.users WHERE email = ''legacy-owner@example.com'' LIMIT 1'
      INTO uid;
  END IF;
  IF uid IS NULL THEN
    uid := '00000000-0000-0000-0000-000000000000';
  END IF;

  UPDATE "purchase_requests"  SET owner_id = uid WHERE owner_id IS NULL;
  UPDATE "evaluations"        SET owner_id = uid WHERE owner_id IS NULL;
  UPDATE "spending_events"    SET owner_id = uid WHERE owner_id IS NULL;
  UPDATE "spending_rules"     SET owner_id = uid WHERE owner_id IS NULL;
  -- Vault rows were labeled with the CLI's placeholder owner until now.
  UPDATE "saved_payment_methods" SET owner_id = uid WHERE owner_id = 'default';
END $$;--> statement-breakpoint

ALTER TABLE "purchase_requests" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluations" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "spending_events" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "spending_rules" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint

CREATE INDEX "purchase_requests_owner_idx" ON "purchase_requests" ("owner_id");--> statement-breakpoint
CREATE INDEX "evaluations_owner_idx" ON "evaluations" ("owner_id");--> statement-breakpoint
CREATE INDEX "spending_events_owner_idx" ON "spending_events" ("owner_id");--> statement-breakpoint

-- Rules: one active row PER PERSON. The key becomes (owner_id, id).
ALTER TABLE "spending_rules" DROP CONSTRAINT "spending_rules_pkey";--> statement-breakpoint
ALTER TABLE "spending_rules" ADD PRIMARY KEY ("owner_id", "id");--> statement-breakpoint

-- Row-level security policies: a signed-in person's own token can only ever
-- touch their own rows. The server connection (postgres role) bypasses RLS and
-- scopes every query itself; these policies are defense in depth for any
-- direct authenticated access (e.g. someone using the public anon key).
-- Guarded so the same migration runs on plain PostgreSQL (tests) where the
-- `auth` helpers do not exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE 'CREATE POLICY own_purchase_requests ON purchase_requests USING (owner_id = auth.uid()::text) WITH CHECK (owner_id = auth.uid()::text)';
    EXECUTE 'CREATE POLICY own_evaluations ON evaluations USING (owner_id = auth.uid()::text) WITH CHECK (owner_id = auth.uid()::text)';
    EXECUTE 'CREATE POLICY own_spending_events ON spending_events USING (owner_id = auth.uid()::text) WITH CHECK (owner_id = auth.uid()::text)';
    EXECUTE 'CREATE POLICY own_spending_rules ON spending_rules USING (owner_id = auth.uid()::text) WITH CHECK (owner_id = auth.uid()::text)';
    EXECUTE 'CREATE POLICY own_saved_payment_methods ON saved_payment_methods USING (owner_id = auth.uid()::text) WITH CHECK (owner_id = auth.uid()::text)';
  END IF;
END $$;
