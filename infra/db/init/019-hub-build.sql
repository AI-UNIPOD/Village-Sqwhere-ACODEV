-- The build tab of a hub: who builds which piece of the design sketch, and the latest commits of
-- the team's public GitHub repository. A piece gets an optional holder (claimed_by with the time
-- it was taken). A hub gets the repository address its owner pastes, and hub_commits holds a copy
-- of the repository's latest commits, replaced on every refresh. Those rows are really deleted,
-- unlike notes and pieces: the copy is public data that GitHub can give again.
-- Why: docs/decisions/2026-11-15-hub-build-tab.md
--
-- Runs after 018-hub-design.sql. Running it twice is safe, so a database made before it can run
-- it once by hand (see infra/README.md).

ALTER TABLE hub_pieces ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES users (id) ON DELETE RESTRICT;
ALTER TABLE hub_pieces ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- a piece is either free (both empty) or held (both set)
DO $$
BEGIN
  ALTER TABLE hub_pieces
    ADD CONSTRAINT hub_pieces_claimed CHECK ((claimed_by IS NULL) = (claimed_at IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE hubs ADD COLUMN IF NOT EXISTS repository_url text;
ALTER TABLE hubs ADD COLUMN IF NOT EXISTS commits_refreshed_at timestamptz;

-- https://github.com/<owner>/<repository>, with nothing else in the address
DO $$
BEGIN
  ALTER TABLE hubs
    ADD CONSTRAINT hubs_repository_url_format CHECK (
      repository_url IS NULL
      OR (char_length(repository_url) <= 200
          AND repository_url ~ '^https://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- position 0 is the newest commit
CREATE TABLE IF NOT EXISTS hub_commits (
  hub_id       uuid        NOT NULL REFERENCES hubs (id) ON DELETE RESTRICT,
  sha          text        NOT NULL,
  message      text        NOT NULL,
  author_name  text        NOT NULL,
  committed_at timestamptz NOT NULL,
  position     smallint    NOT NULL,
  PRIMARY KEY (hub_id, sha),
  CONSTRAINT hub_commits_sha_format     CHECK (sha ~ '^[0-9a-f]{40}$'),
  CONSTRAINT hub_commits_message_length CHECK (char_length(message) BETWEEN 1 AND 200),
  CONSTRAINT hub_commits_author_length  CHECK (char_length(author_name) <= 100),
  CONSTRAINT hub_commits_position       CHECK (position >= 0)
);
