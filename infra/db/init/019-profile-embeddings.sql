-- One vector per developer profile. Missing rows are picked up by the embedding worker.
CREATE TABLE profile_embeddings (
  user_id       uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  model         text        NOT NULL DEFAULT 'all-MiniLM-L6-v2',
  embedding     vector(384) NOT NULL,
  source_sha256 text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT profile_embeddings_model CHECK (model = 'all-MiniLM-L6-v2'),
  CONSTRAINT profile_embeddings_sha256_format CHECK (source_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX profile_embeddings_hnsw_idx
  ON profile_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE FUNCTION users_invalidate_profile_embedding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM profile_embeddings WHERE user_id = NEW.id;
  RETURN NULL;
END $$;

CREATE TRIGGER users_invalidate_profile_embedding
  AFTER UPDATE OF bio, deleted_at ON users
  FOR EACH ROW
  WHEN (NEW.bio IS DISTINCT FROM OLD.bio OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
  EXECUTE FUNCTION users_invalidate_profile_embedding();

CREATE FUNCTION user_links_invalidate_profile_embedding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM profile_embeddings WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN NULL;
END $$;

CREATE TRIGGER user_roles_invalidate_profile_embedding
  AFTER INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION user_links_invalidate_profile_embedding();
CREATE TRIGGER user_technologies_invalidate_profile_embedding
  AFTER INSERT OR UPDATE OR DELETE ON user_technologies
  FOR EACH ROW EXECUTE FUNCTION user_links_invalidate_profile_embedding();
CREATE TRIGGER user_sectors_invalidate_profile_embedding
  AFTER INSERT OR UPDATE OR DELETE ON user_sectors
  FOR EACH ROW EXECUTE FUNCTION user_links_invalidate_profile_embedding();
