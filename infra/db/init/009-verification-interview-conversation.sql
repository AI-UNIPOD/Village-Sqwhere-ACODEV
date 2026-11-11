ALTER TABLE verification_interviews
  ADD COLUMN IF NOT EXISTS welcome_message text,
  ADD COLUMN IF NOT EXISTS closing_message text;

ALTER TABLE verification_interview_turns
  ADD COLUMN IF NOT EXISTS acknowledgement text;
