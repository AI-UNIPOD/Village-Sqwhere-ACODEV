-- How long a developer waits before asking to join a hub again after its owner turned them
-- down: 48 hours after each decline, and 30 days after the fifth decline in a row, after which
-- the count starts again. Kept per developer and hub. Approval or joining clears both.
-- Why: docs/decisions/2026-11-13-hub-join-requests.md
--
-- Runs after 002-schema.sql. Running it twice is safe, so a database made before it can run
-- it once by hand (see infra/README.md).

ALTER TABLE hub_members
  ADD COLUMN IF NOT EXISTS declines_in_a_row smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS can_ask_again_at  timestamptz;

DO $$
BEGIN
  ALTER TABLE hub_members
    ADD CONSTRAINT hub_members_declines_in_a_row CHECK (declines_in_a_row BETWEEN 0 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
