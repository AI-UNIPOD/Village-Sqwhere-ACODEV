-- Embeddings from Google's gemini-embedding-2, 768 numbers wide, for ideas and for developers.
-- idea_embeddings moves from all-MiniLM-L6-v2 (384 wide) to the new model, and user_embeddings
-- is new. A vector is a copy made from public text, and "a missing row means needs embedding",
-- so this script removes every idea_embeddings row of another model before it changes the
-- column: the product never wrote that table, and the worker makes the rows again. A developer's
-- vector is removed by a trigger when the text it was made from changes: the bio, or a verified
-- role, a technology or a sector. The match score does not use these tables yet.
-- Why: docs/decisions/2026-11-15-embeddings-on-gemini.md
--
-- Runs after 020-hub-agreement-v2.sql (021 to 024 belong to other work). Running it twice is
-- safe, so a database made before it can run it once by hand (see infra/README.md).
-- 028-embeddings-on-openai.sql moves both tables to text-embedding-3-small. This script lets
-- that model's rows be, so running every script again in order keeps the vectors.

DELETE FROM idea_embeddings
  WHERE model NOT IN ('gemini-embedding-2', 'text-embedding-3-small');

ALTER TABLE idea_embeddings DROP CONSTRAINT IF EXISTS idea_embeddings_model;
ALTER TABLE idea_embeddings ALTER COLUMN model SET DEFAULT 'gemini-embedding-2';
DROP INDEX IF EXISTS idea_embeddings_hnsw_idx;
ALTER TABLE idea_embeddings ALTER COLUMN embedding TYPE vector(768);

-- Mixing models in one index silently breaks similarity, so the model is pinned: here to this
-- script's model or its successor, and to the successor alone by 028.
ALTER TABLE idea_embeddings
  ADD CONSTRAINT idea_embeddings_model
  CHECK (model IN ('gemini-embedding-2', 'text-embedding-3-small'));
CREATE INDEX idea_embeddings_hnsw_idx ON idea_embeddings USING hnsw (embedding vector_cosine_ops);

-- One embedding per developer, made by the worker from their verified roles, technologies,
-- sectors and bio. Never from a name, a username or an email.
CREATE TABLE IF NOT EXISTS user_embeddings (
  user_id       uuid         PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  model         text         NOT NULL DEFAULT 'gemini-embedding-2',
  embedding     vector(768)  NOT NULL,
  source_sha256 text         NOT NULL,   -- hash of the exact text that was embedded
  created_at    timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT user_embeddings_model CHECK (model = 'gemini-embedding-2'),
  CONSTRAINT user_embeddings_sha256_format CHECK (source_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS user_embeddings_hnsw_idx
  ON user_embeddings USING hnsw (embedding vector_cosine_ops);

-- When the bio changes, drop the stale vector so the worker embeds the profile again.
CREATE OR REPLACE FUNCTION users_invalidate_embedding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM user_embeddings WHERE user_id = NEW.id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS users_invalidate_embedding ON users;
CREATE TRIGGER users_invalidate_embedding
  AFTER UPDATE OF bio ON users
  FOR EACH ROW
  WHEN (NEW.bio IS DISTINCT FROM OLD.bio)
  EXECUTE FUNCTION users_invalidate_embedding();

-- The same for the rows a profile is made from. A role counts when it is verified, so a
-- change of the role itself or of its verified_at matters; being primary does not.
CREATE OR REPLACE FUNCTION user_profile_rows_invalidate_embedding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM user_embeddings WHERE user_id = OLD.user_id;
  ELSE
    DELETE FROM user_embeddings WHERE user_id = NEW.user_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS user_roles_invalidate_embedding ON user_roles;
CREATE TRIGGER user_roles_invalidate_embedding
  AFTER INSERT OR DELETE OR UPDATE OF role_id, verified_at ON user_roles
  FOR EACH ROW EXECUTE FUNCTION user_profile_rows_invalidate_embedding();

DROP TRIGGER IF EXISTS user_technologies_invalidate_embedding ON user_technologies;
CREATE TRIGGER user_technologies_invalidate_embedding
  AFTER INSERT OR DELETE OR UPDATE OF technology_id ON user_technologies
  FOR EACH ROW EXECUTE FUNCTION user_profile_rows_invalidate_embedding();

DROP TRIGGER IF EXISTS user_sectors_invalidate_embedding ON user_sectors;
CREATE TRIGGER user_sectors_invalidate_embedding
  AFTER INSERT OR DELETE OR UPDATE OF sector_id ON user_sectors
  FOR EACH ROW EXECUTE FUNCTION user_profile_rows_invalidate_embedding();
