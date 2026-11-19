-- Sign-in state lives in Postgres, so any API instance can finish what another started:
-- oauth_states holds the one-time states /auth/oauth/{provider}/start issues, login_codes the
-- one-time codes the callback issues, and revoked_refresh_tokens the refresh tokens that were
-- signed out or rotated. They were kept in API memory before, which needs a single process.
-- Only the SHA-256 of a state, a code or a token is stored, never the value itself.
-- A row is of no use after expires_at; the API removes old rows when it writes a new one.
-- Why: docs/decisions/2026-11-19-sign-in-state-in-postgres.md
--
-- Runs after 002-schema.sql. Number 028 belongs to other work. Running it twice is safe, so a
-- database made before it can run it once by hand (see infra/README.md).

CREATE TABLE IF NOT EXISTS oauth_states (
  state_sha256   text          PRIMARY KEY,
  provider       auth_provider NOT NULL,
  code_challenge text          NOT NULL,   -- PKCE challenge, copied to the login code
  redirect_uri   text          NOT NULL,
  expires_at     timestamptz   NOT NULL,
  CONSTRAINT oauth_states_sha256_format CHECK (state_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx ON oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS login_codes (
  code_sha256    text        PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  is_new_user    boolean     NOT NULL,
  code_challenge text        NOT NULL,
  expires_at     timestamptz NOT NULL,
  CONSTRAINT login_codes_sha256_format CHECK (code_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS login_codes_expires_at_idx ON login_codes (expires_at);
CREATE INDEX IF NOT EXISTS login_codes_user_idx ON login_codes (user_id);

-- expires_at is the token's own expiry: after it the token is refused anyway
CREATE TABLE IF NOT EXISTS revoked_refresh_tokens (
  token_sha256 text        PRIMARY KEY,
  expires_at   timestamptz NOT NULL,
  CONSTRAINT revoked_refresh_tokens_sha256_format CHECK (token_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS revoked_refresh_tokens_expires_at_idx
  ON revoked_refresh_tokens (expires_at);
