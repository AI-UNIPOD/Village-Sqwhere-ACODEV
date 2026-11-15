-- Post images live in Postgres: post_attachments keeps each image's bytes, and the API serves
-- them at GET /v1/post-images/{id}. No object storage, so storage_key is no longer needed.
-- The cap drops from 5 MB to 4 MB so an upload fits inside Vercel's 4.5 MB request limit.
-- Why: docs/decisions/2026-11-15-post-images-in-postgres.md
--
-- Runs after 002-schema.sql. Uploads never shipped before this, so the table is empty and the
-- new column can be required. Running it twice is safe (see infra/README.md).

ALTER TABLE post_attachments ADD COLUMN IF NOT EXISTS data bytea NOT NULL;
ALTER TABLE post_attachments ALTER COLUMN storage_key DROP NOT NULL;

ALTER TABLE post_attachments DROP CONSTRAINT IF EXISTS post_attachments_byte_size;
ALTER TABLE post_attachments
  ADD CONSTRAINT post_attachments_byte_size CHECK (byte_size BETWEEN 1 AND 4194304);
ALTER TABLE post_attachments DROP CONSTRAINT IF EXISTS post_attachments_data_size;
ALTER TABLE post_attachments
  ADD CONSTRAINT post_attachments_data_size CHECK (octet_length(data) = byte_size);
