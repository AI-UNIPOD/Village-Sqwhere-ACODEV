-- When a developer finished onboarding, so the web stops sending them back to it. Empty until
-- they finish; the API sets it once and never clears it.
-- Why: docs/decisions/2026-11-15-onboarding-done.md
--
-- Runs after 002-schema.sql. Running it twice is safe, so a database made before it can run
-- it once by hand (see infra/README.md).

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
