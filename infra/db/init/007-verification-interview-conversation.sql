ALTER TABLE verification_interviews
  ADD COLUMN welcome_message text,
  ADD COLUMN closing_message text;

ALTER TABLE verification_interview_turns
  ADD COLUMN acknowledgement text;
