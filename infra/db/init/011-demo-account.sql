-- The demo behind "Try the demo". users.is_demo marks every account in the demo: the shared
-- account that anyone can sign in as, without GitHub, when the API runs with DEMO_ENABLED=true,
-- and the made-up developers whose posts, ideas and hubs it shows. The API refuses every change
-- a demo account tries to make. A separate seed script creates them, outside this folder.
--
-- Runs after 002-schema.sql. Running it twice is safe, so a database made before it can run
-- it once by hand (see infra/README.md).

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
