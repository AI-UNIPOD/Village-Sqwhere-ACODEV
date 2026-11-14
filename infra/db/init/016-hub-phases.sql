-- The phase a hub is in. A hub has none until its owner confirms the team; then it is in
-- brainstorm, and the owner moves it one phase forward or one back. Every change is logged in
-- hub_phase_moves, which nobody can edit or delete. Without this the hub page can only print
-- the four phase names, because nothing says which one the hub is in.
-- Why: docs/decisions/2026-11-14-hub-phases.md
--
-- Runs after 002-schema.sql. Running it twice is safe, so a database made before it can run
-- it once by hand (see infra/README.md).

DO $$
BEGIN
  CREATE TYPE hub_phase AS ENUM ('brainstorm', 'design', 'build', 'review');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE hubs ADD COLUMN IF NOT EXISTS phase hub_phase;
ALTER TABLE hubs ADD COLUMN IF NOT EXISTS team_confirmed_at timestamptz;

-- a hub is either not started (both empty) or confirmed and in a phase (both set)
DO $$
BEGIN
  ALTER TABLE hubs
    ADD CONSTRAINT hubs_phase_confirmed CHECK ((phase IS NULL) = (team_confirmed_at IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One row per change. from_phase is empty for the first one, when the team is confirmed.
CREATE TABLE IF NOT EXISTS hub_phase_moves (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id     uuid        NOT NULL REFERENCES hubs (id) ON DELETE RESTRICT,
  moved_by   uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  from_phase hub_phase,
  to_phase   hub_phase   NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hub_phase_moves_hub_idx ON hub_phase_moves (hub_id, created_at);

DO $$
BEGIN
  CREATE TRIGGER hub_phase_moves_append_only BEFORE UPDATE OR DELETE ON hub_phase_moves
    FOR EACH ROW EXECUTE FUNCTION reject_modification();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
