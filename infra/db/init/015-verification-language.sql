-- The language an attempt runs in, 'en' or 'fr': the AI interviewer asks its questions in it and
-- the final report for the peer reviewer is written in it. It is chosen when the attempt starts and
-- never changes, because the report is written later by the worker and has to match the
-- interview. Attempts made before this script are 'en', the language they ran in.
-- Why: docs/decisions/2026-11-14-verification-language.md
--
-- Runs after 002-schema.sql. Running it twice is safe, so a database made before it can run
-- it once by hand (see infra/README.md).

ALTER TABLE verification_sessions ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';

DO $$
BEGIN
  ALTER TABLE verification_sessions
    ADD CONSTRAINT verification_sessions_language CHECK (language IN ('en', 'fr'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
