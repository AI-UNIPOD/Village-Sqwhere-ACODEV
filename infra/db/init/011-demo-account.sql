-- The read-only demo account behind "Try the demo": one shared account that anyone can sign in
-- as, without GitHub, when the API runs with DEMO_ENABLED=true. The API refuses every change it
-- tries to make. There is at most one. Its made-up content comes from a separate seed script.
--
-- Runs after 002-schema.sql. Running it twice is safe, so a database made before it can run
-- it once by hand (see infra/README.md).

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS users_one_demo_uq ON users (is_demo) WHERE is_demo;
