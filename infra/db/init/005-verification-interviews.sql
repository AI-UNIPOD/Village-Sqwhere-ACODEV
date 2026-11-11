CREATE TYPE interview_status AS ENUM ('active', 'completed', 'abandoned');

CREATE TABLE verification_interviews (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_session_id uuid NOT NULL UNIQUE
    REFERENCES verification_sessions (id) ON DELETE CASCADE,
  status                  interview_status NOT NULL DEFAULT 'active',
  turn_number             smallint NOT NULL DEFAULT 1,
  started_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE verification_interview_turns (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id   uuid NOT NULL REFERENCES verification_interviews (id) ON DELETE CASCADE,
  sequence       smallint NOT NULL,
  question       text NOT NULL,
  answer_text    text,
  security_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_interview_turn_uq UNIQUE (interview_id, sequence)
);

CREATE TRIGGER verification_interviews_set_updated_at BEFORE UPDATE ON verification_interviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
