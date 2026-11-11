ALTER TABLE verification_sessions
  ADD COLUMN analysis_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN last_error text;
