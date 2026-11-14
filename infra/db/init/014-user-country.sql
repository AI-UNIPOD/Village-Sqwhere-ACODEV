-- Where a developer is: the country only, as a two-letter ISO 3166-1 code such as NG or SN.
-- It is optional, and there is no city on purpose. The API checks the code against the 54
-- African countries; the table only checks the shape, so a new country needs no script.
-- Why: docs/decisions/2026-11-14-profile-country.md
--
-- Runs after 002-schema.sql. Running it twice is safe, so a database made before it can run
-- it once by hand (see infra/README.md).

ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code text;

DO $$
BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_country_code_format CHECK (country_code ~ '^[A-Z]{2}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
