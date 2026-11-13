-- Which "no" ended a hub membership row in "declined": the developer declined an invitation,
-- the owner turned down a join request, or the developer withdrew their own request. Without
-- it the owner's team list shows the same "declined" for all three. Rows declined before this
-- script have none, and the API sends null for them.
-- Why: docs/decisions/2026-11-13-hub-join-requests.md
--
-- Runs after 002-schema.sql. Running it twice is safe, so a database made before it can run
-- it once by hand (see infra/README.md).

DO $$
BEGIN
  CREATE TYPE hub_decline_kind AS ENUM
    ('invitation_declined', 'request_declined', 'request_withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE hub_members ADD COLUMN IF NOT EXISTS decline_kind hub_decline_kind;

-- one way only, so rows declined before this script stay valid without a kind
DO $$
BEGIN
  ALTER TABLE hub_members
    ADD CONSTRAINT hub_members_decline_kind CHECK (decline_kind IS NULL OR status = 'declined');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
