-- The design sketch of a hub: the pieces of the system (a name and a summary) and the labelled
-- links between them, which the page draws as boxes and arrows. Deleting a piece or a link only
-- fills deleted_at, so the row stays. There are no positions: the page lays the sketch out
-- itself.
-- Why: docs/decisions/2026-11-14-hub-design-sketch.md
--
-- Runs after 017-hub-notes.sql. Running it twice is safe, so a database made before it can
-- run it once by hand (see infra/README.md).

CREATE TABLE IF NOT EXISTS hub_pieces (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id     uuid        NOT NULL REFERENCES hubs (id) ON DELETE RESTRICT,
  name       text        NOT NULL,
  summary    text        NOT NULL DEFAULT '',
  created_by uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- lets a link point at a piece and name the hub in one foreign key
  CONSTRAINT hub_pieces_id_hub_uq UNIQUE (id, hub_id),
  CONSTRAINT hub_pieces_name_length    CHECK (char_length(name) BETWEEN 1 AND 60),
  CONSTRAINT hub_pieces_summary_length CHECK (char_length(summary) BETWEEN 0 AND 280)
);

-- the list and the count of a hub's pieces read only the ones not deleted
CREATE INDEX IF NOT EXISTS hub_pieces_listing_idx
  ON hub_pieces (hub_id, created_at, id) WHERE deleted_at IS NULL;

-- two pieces of a hub that are not deleted cannot share a name, ignoring case and outer spaces
CREATE UNIQUE INDEX IF NOT EXISTS hub_pieces_name_uq
  ON hub_pieces (hub_id, lower(btrim(name))) WHERE deleted_at IS NULL;

DO $$
BEGIN
  CREATE TRIGGER hub_pieces_set_updated_at BEFORE UPDATE ON hub_pieces
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- An arrow from one piece to another, with a label such as "sends payouts to".
CREATE TABLE IF NOT EXISTS hub_piece_links (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id        uuid        NOT NULL REFERENCES hubs (id) ON DELETE RESTRICT,
  from_piece_id uuid        NOT NULL,
  to_piece_id   uuid        NOT NULL,
  label         text        NOT NULL,
  created_by    uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  -- both pieces belong to the link's own hub
  CONSTRAINT hub_piece_links_from_fk
    FOREIGN KEY (from_piece_id, hub_id) REFERENCES hub_pieces (id, hub_id) ON DELETE RESTRICT,
  CONSTRAINT hub_piece_links_to_fk
    FOREIGN KEY (to_piece_id, hub_id) REFERENCES hub_pieces (id, hub_id) ON DELETE RESTRICT,
  CONSTRAINT hub_piece_links_label_length CHECK (char_length(label) BETWEEN 1 AND 60),
  CONSTRAINT hub_piece_links_not_itself   CHECK (from_piece_id <> to_piece_id)
);

-- the list and the count of a hub's links read only the ones not deleted
CREATE INDEX IF NOT EXISTS hub_piece_links_listing_idx
  ON hub_piece_links (hub_id, created_at, id) WHERE deleted_at IS NULL;

-- one link from a piece to another at a time; the opposite direction is a different link
CREATE UNIQUE INDEX IF NOT EXISTS hub_piece_links_direction_uq
  ON hub_piece_links (from_piece_id, to_piece_id) WHERE deleted_at IS NULL;
