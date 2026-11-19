-- The vectors move from Google's gemini-embedding-2 to OpenAI's text-embedding-3-small, still 768
-- numbers wide. Vectors of two models cannot be compared, so this script removes every row of
-- another model and pins the new one on both tables. A vector is a copy made from public text
-- and a missing row means "needs embedding", so the worker makes the rows again.
-- Why: docs/decisions/2026-11-19-embeddings-on-openai.md
--
-- Runs after 025-embeddings.sql. Running it twice is safe, so a database made before it can run
-- it once by hand (see infra/README.md). If 025 is ever run again, run this one after it.

DELETE FROM idea_embeddings WHERE model <> 'text-embedding-3-small';
DELETE FROM user_embeddings WHERE model <> 'text-embedding-3-small';

ALTER TABLE idea_embeddings ALTER COLUMN model SET DEFAULT 'text-embedding-3-small';
ALTER TABLE idea_embeddings DROP CONSTRAINT IF EXISTS idea_embeddings_model;
ALTER TABLE idea_embeddings
  ADD CONSTRAINT idea_embeddings_model CHECK (model = 'text-embedding-3-small');

ALTER TABLE user_embeddings ALTER COLUMN model SET DEFAULT 'text-embedding-3-small';
ALTER TABLE user_embeddings DROP CONSTRAINT IF EXISTS user_embeddings_model;
ALTER TABLE user_embeddings
  ADD CONSTRAINT user_embeddings_model CHECK (model = 'text-embedding-3-small');
