CREATE TYPE verification_phase AS ENUM (
  'codebase_analysis',
  'technical_defence',
  'report_generation'
);

ALTER TABLE verification_sessions
  ADD COLUMN current_phase verification_phase;
