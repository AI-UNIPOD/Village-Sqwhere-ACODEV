-- The review checklist of a hub: short checks written against a piece (what to look at), which
-- a teammate ticks once they read the piece's work. Nobody ticks a check of a piece they build:
-- the API enforces that, because the holder is not stored here. A check is plain text of 1 to 200
-- characters. Deleting one only fills deleted_at and deleted_by, so the row stays. A hub also
-- gets finished_at, empty until its owner finishes it.
-- Why: docs/decisions/2026-11-15-hub-review-checklist.md
--
-- Runs after 019-hub-build.sql (020 belongs to another change). Running it twice is safe, so a
-- database made before it can run it once by hand (see infra/README.md).

ALTER TABLE hubs ADD COLUMN IF NOT EXISTS finished_at timestamptz;

CREATE TABLE IF NOT EXISTS hub_checks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id     uuid        NOT NULL REFERENCES hubs (id) ON DELETE RESTRICT,
  piece_id   uuid        NOT NULL,
  text       text        NOT NULL,
  created_by uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  ticked_by  uuid        REFERENCES users (id) ON DELETE RESTRICT,
  ticked_at  timestamptz,
  deleted_at timestamptz,
  deleted_by uuid        REFERENCES users (id) ON DELETE RESTRICT,
  -- the piece belongs to the check's own hub
  CONSTRAINT hub_checks_piece_fk
    FOREIGN KEY (piece_id, hub_id) REFERENCES hub_pieces (id, hub_id) ON DELETE RESTRICT,
  CONSTRAINT hub_checks_text_length    CHECK (char_length(text) BETWEEN 1 AND 200),
  CONSTRAINT hub_checks_text_not_blank CHECK (btrim(text) <> ''),
  -- a check is open (both empty) or ticked (both set)
  CONSTRAINT hub_checks_ticked  CHECK ((ticked_by IS NULL) = (ticked_at IS NULL)),
  CONSTRAINT hub_checks_deleted CHECK ((deleted_by IS NULL) = (deleted_at IS NULL))
);

-- the list and the count of a hub's checks read only the ones not deleted
CREATE INDEX IF NOT EXISTS hub_checks_listing_idx
  ON hub_checks (hub_id, created_at, id) WHERE deleted_at IS NULL;
