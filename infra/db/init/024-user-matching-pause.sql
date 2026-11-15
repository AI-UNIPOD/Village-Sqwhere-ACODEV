-- When a developer paused matching: while it is set, owners are not shown them as a match.
-- Empty while matching is on. Their own matches and public profile are not affected.
-- Why: docs/decisions/2026-11-15-pause-matching.md
--
-- Runs after 002-schema.sql. Running it twice is safe, so a database made before it can run
-- it once by hand (see infra/README.md).

ALTER TABLE users ADD COLUMN IF NOT EXISTS matching_paused_at timestamptz;
