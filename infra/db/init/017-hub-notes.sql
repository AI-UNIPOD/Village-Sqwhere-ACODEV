-- Brainstorm notes: short sticky notes a hub's team writes while the hub is in brainstorm.
-- A note is plain text of 1 to 280 characters. Deleting one only fills deleted_at, so the row
-- stays. 002-schema.sql has hub_messages, a chat with long, editable messages, which is a
-- different tool, so notes get their own table.
-- Why: docs/decisions/2026-11-14-hub-brainstorm-notes.md
--
-- Runs after 016-hub-phases.sql. Running it twice is safe, so a database made before it can
-- run it once by hand (see infra/README.md).

CREATE TABLE IF NOT EXISTS hub_notes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id     uuid        NOT NULL REFERENCES hubs (id) ON DELETE RESTRICT,
  author_id  uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT hub_notes_body_length CHECK (char_length(body) BETWEEN 1 AND 280)
);

-- the list and the count of a hub's notes read only the ones not deleted
CREATE INDEX IF NOT EXISTS hub_notes_listing_idx
  ON hub_notes (hub_id, created_at, id) WHERE deleted_at IS NULL;
