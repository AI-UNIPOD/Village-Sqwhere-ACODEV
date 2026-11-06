-- =============================================================================
-- ACODEV 2026 — PostgreSQL schema, v1
-- African Developer Exchange & Collaboration Network
--
-- Target   : PostgreSQL 14+ (tested on PostgreSQL 16.15)
-- Requires : pgvector >= 0.5.0 (HNSW index; tested on 0.6.0)
-- Hosting  : Systalink managed PostgreSQL (confirm `vector` is available:
--            SELECT * FROM pg_available_extensions WHERE name = 'vector';)
--
-- Conventions
--   * snake_case everywhere; every table's PK is `id` unless it is a pure
--     junction table (composite PK).
--   * UUID ids for anything exposed through the API (non-guessable, and the
--     web client can generate them for offline drafts and idempotent retries).
--   * timestamptz for every timestamp, defaulting to now().
--   * Soft delete (`deleted_at`) for user-generated content; hard delete only
--     for pure personal data (likes, saves, preferences) or admin purges.
--   * Integrity rules live in the database (constraints first, triggers where
--     a constraint cannot express the rule).
--
-- The whole file runs in one transaction: it either all applies or nothing does.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- -----------------------------------------------------------------------------
-- 1. Enumerated types
--    Enums for small, code-driven state machines. Lookup tables (roles,
--    technologies) for vocabularies that grow and carry display data.
-- -----------------------------------------------------------------------------

CREATE TYPE auth_provider       AS ENUM ('github', 'bitbucket');
CREATE TYPE platform_role       AS ENUM ('member', 'moderator', 'admin');
CREATE TYPE deletion_reason     AS ENUM ('author', 'moderator', 'account_deleted');
CREATE TYPE verification_status AS ENUM ('pending', 'in_progress', 'awaiting_review',
                                         'passed', 'failed', 'abandoned');
CREATE TYPE idea_stage          AS ENUM ('concept', 'prototype', 'building');
CREATE TYPE idea_status         AS ENUM ('draft', 'open', 'closed');
CREATE TYPE hub_status          AS ENUM ('active', 'archived');
CREATE TYPE hub_member_role     AS ENUM ('owner', 'member');
CREATE TYPE hub_member_status   AS ENUM ('requested', 'invited', 'active',
                                         'declined', 'left', 'removed');
CREATE TYPE post_type           AS ENUM ('general', 'question', 'architecture_challenge',
                                         'code_review_request', 'oss_release', 'rfc',
                                         'research_note', 'hub_milestone');

-- -----------------------------------------------------------------------------
-- 2. Shared trigger functions
-- -----------------------------------------------------------------------------

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Rejects any UPDATE or DELETE. Used on legal / audit records.
CREATE FUNCTION reject_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

-- =============================================================================
-- 3. Identity & profile
-- =============================================================================

CREATE TABLE users (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  username          text          NOT NULL,
  display_name      text          NOT NULL,
  first_name        text,
  last_name         text,
  email             text,
  email_verified_at timestamptz,
  avatar_url        text,
  bio               text,
  platform_role     platform_role NOT NULL DEFAULT 'member',
  verified_at       timestamptz,
  is_verified       boolean       GENERATED ALWAYS AS (verified_at IS NOT NULL) STORED,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  deleted_at        timestamptz,

  CONSTRAINT users_username_format     CHECK (username ~ '^[A-Za-z0-9_-]{3,39}$'),
  CONSTRAINT users_display_name_length CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  CONSTRAINT users_first_name_length   CHECK (first_name IS NULL OR char_length(btrim(first_name)) BETWEEN 1 AND 100),
  CONSTRAINT users_last_name_length    CHECK (last_name  IS NULL OR char_length(btrim(last_name))  BETWEEN 1 AND 100),
  CONSTRAINT users_email_format        CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT users_email_verified      CHECK (email_verified_at IS NULL OR email IS NOT NULL),
  CONSTRAINT users_avatar_https        CHECK (avatar_url IS NULL OR avatar_url ~ '^https://'),
  CONSTRAINT users_bio_length          CHECK (bio IS NULL OR char_length(bio) <= 1000)
);

-- Case-insensitive uniqueness: "Faisal" and "faisal" are the same handle.
CREATE UNIQUE INDEX users_username_lower_uq ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower_uq    ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One row per linked login. Keyed on the provider's immutable account id,
-- never the username (GitHub and Bitbucket usernames can be changed).
-- OAuth tokens are deliberately NOT stored here.
CREATE TABLE user_identities (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider          auth_provider NOT NULL,
  provider_user_id  text          NOT NULL,
  provider_username text          NOT NULL,
  linked_at         timestamptz   NOT NULL DEFAULT now(),
  last_login_at     timestamptz,

  CONSTRAINT user_identities_provider_account_uq UNIQUE (provider, provider_user_id),
  CONSTRAINT user_identities_one_per_provider_uq UNIQUE (user_id, provider),
  CONSTRAINT user_identities_provider_user_id_nonempty CHECK (char_length(provider_user_id) > 0)
);

-- Job roles ("what they can do"): AI engineer, backend engineer, ...
CREATE TABLE roles (
  id         smallint    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text        NOT NULL,
  name       text        NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT roles_slug_uq     UNIQUE (slug),
  CONSTRAINT roles_name_uq     UNIQUE (name),
  CONSTRAINT roles_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- Stacks / topics: Flutter, PyTorch, Kubernetes, ...
-- One vocabulary shared by user stacks, post tags and feed preferences.
CREATE TABLE technologies (
  id         integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text        NOT NULL,
  name       text        NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT technologies_slug_uq     UNIQUE (slug),
  CONSTRAINT technologies_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX technologies_name_lower_uq ON technologies (lower(name));

-- The roles a user claims. verified_at is set by a passed verification session.
CREATE TABLE user_roles (
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id     smallint    NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  is_primary  boolean     NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, role_id)
);
-- At most one primary role per user (the whiteboard's single "role").
CREATE UNIQUE INDEX user_roles_one_primary_uq ON user_roles (user_id) WHERE is_primary;
-- "Find verified backend engineers" for team matching.
CREATE INDEX user_roles_role_idx ON user_roles (role_id, user_id) WHERE verified_at IS NOT NULL;

CREATE TABLE user_technologies (
  user_id       uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  technology_id integer     NOT NULL REFERENCES technologies (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, technology_id)
);
CREATE INDEX user_technologies_technology_idx ON user_technologies (technology_id);

-- Feed preferences: the topics a user wants to see.
CREATE TABLE user_feed_topics (
  user_id       uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  technology_id integer     NOT NULL REFERENCES technologies (id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, technology_id)
);

-- =============================================================================
-- 4. Experience verification (max 3 attempts per user per role)
-- =============================================================================

CREATE TABLE verification_sessions (
  id             uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid                NOT NULL,
  role_id        smallint            NOT NULL,
  attempt_number smallint            NOT NULL,          -- assigned by trigger
  status         verification_status NOT NULL DEFAULT 'pending',
  source         auth_provider,                         -- where the code came from
  evidence       jsonb               NOT NULL DEFAULT '[]'::jsonb,  -- snapshot of repos/commits analysed
  ai_score       numeric(5,2),
  ai_result      jsonb,                                 -- rubric breakdown, model version
  reviewer_id    uuid                REFERENCES users (id) ON DELETE RESTRICT,
  reviewer_notes text,
  started_at     timestamptz,
  completed_at   timestamptz,                           -- AI assessment finished
  decided_at     timestamptz,                           -- final pass/fail recorded
  created_at     timestamptz         NOT NULL DEFAULT now(),
  updated_at     timestamptz         NOT NULL DEFAULT now(),

  -- You can only verify a role you have claimed. RESTRICT stops anyone
  -- resetting their attempt count by deleting and re-adding the role.
  CONSTRAINT verification_sessions_user_role_fk
    FOREIGN KEY (user_id, role_id) REFERENCES user_roles (user_id, role_id) ON DELETE RESTRICT,
  CONSTRAINT verification_sessions_attempt_uq      UNIQUE (user_id, role_id, attempt_number),
  CONSTRAINT verification_sessions_attempt_range   CHECK (attempt_number BETWEEN 1 AND 3),
  CONSTRAINT verification_sessions_score_range     CHECK (ai_score IS NULL OR ai_score BETWEEN 0 AND 100),
  CONSTRAINT verification_sessions_evidence_array  CHECK (jsonb_typeof(evidence) = 'array'),
  CONSTRAINT verification_sessions_no_self_review  CHECK (reviewer_id IS NULL OR reviewer_id <> user_id),
  CONSTRAINT verification_sessions_decided_at      CHECK ((status IN ('passed', 'failed')) = (decided_at IS NOT NULL)),
  -- PRD §7.2: AI output is confirmed by a peer before a badge is issued.
  CONSTRAINT verification_sessions_pass_needs_reviewer CHECK (status <> 'passed' OR reviewer_id IS NOT NULL)
);
-- Only one attempt in flight per user per role.
CREATE UNIQUE INDEX verification_sessions_one_open_uq
  ON verification_sessions (user_id, role_id)
  WHERE status IN ('pending', 'in_progress', 'awaiting_review');
-- A role can be passed once.
CREATE UNIQUE INDEX verification_sessions_one_pass_uq
  ON verification_sessions (user_id, role_id)
  WHERE status = 'passed';
-- Reviewer work queue.
CREATE INDEX verification_sessions_review_queue_idx
  ON verification_sessions (role_id, created_at)
  WHERE status = 'awaiting_review';

CREATE TRIGGER verification_sessions_set_updated_at BEFORE UPDATE ON verification_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Assign attempt_number. Locking the user_roles row serialises two
-- simultaneous "start verification" requests for the same role.
CREATE FUNCTION verification_sessions_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_next smallint;
BEGIN
  PERFORM 1 FROM user_roles
   WHERE user_id = NEW.user_id AND role_id = NEW.role_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user % has not claimed role %', NEW.user_id, NEW.role_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM verification_sessions
              WHERE user_id = NEW.user_id AND role_id = NEW.role_id AND status = 'passed') THEN
    RAISE EXCEPTION 'role already verified for this user'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(max(attempt_number), 0) + 1 INTO v_next
    FROM verification_sessions
   WHERE user_id = NEW.user_id AND role_id = NEW.role_id;

  IF v_next > 3 THEN
    RAISE EXCEPTION 'maximum of 3 verification attempts reached for this role'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.attempt_number := v_next;
  NEW.status := 'pending';
  RETURN NEW;
END $$;

CREATE TRIGGER verification_sessions_before_insert BEFORE INSERT ON verification_sessions
  FOR EACH ROW EXECUTE FUNCTION verification_sessions_before_insert();

-- Terminal states are final; identity columns are immutable.
CREATE FUNCTION verification_sessions_before_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id OR NEW.role_id <> OLD.role_id
     OR NEW.attempt_number <> OLD.attempt_number THEN
    RAISE EXCEPTION 'user_id, role_id and attempt_number are immutable';
  END IF;
  IF OLD.status IN ('passed', 'failed', 'abandoned') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'verification session is already %', OLD.status;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER verification_sessions_before_update BEFORE UPDATE ON verification_sessions
  FOR EACH ROW EXECUTE FUNCTION verification_sessions_before_update();

-- On pass: mark the role verified and set the user's is_verified flag.
CREATE FUNCTION verification_sessions_after_pass() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE user_roles
     SET verified_at = NEW.decided_at
   WHERE user_id = NEW.user_id AND role_id = NEW.role_id;

  UPDATE users
     SET verified_at = COALESCE(verified_at, NEW.decided_at)
   WHERE id = NEW.user_id;
  RETURN NULL;
END $$;

CREATE TRIGGER verification_sessions_after_pass
  AFTER UPDATE OF status ON verification_sessions
  FOR EACH ROW
  WHEN (NEW.status = 'passed' AND OLD.status IS DISTINCT FROM 'passed')
  EXECUTE FUNCTION verification_sessions_after_pass();

-- =============================================================================
-- 5. Ideas & matching (pgvector, all-MiniLM-L6-v2 = 384 dimensions)
-- =============================================================================

CREATE TABLE ideas (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id    uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  title        text        NOT NULL,
  summary      text        NOT NULL,   -- public abstract, visible before the NDA
  details      text,                   -- confidential brief, hub members only
  stage        idea_stage  NOT NULL DEFAULT 'concept',
  status       idea_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,

  -- Target of the hubs (idea_id, owner_id) FK: "the hub owner is the idea author".
  CONSTRAINT ideas_id_author_uq     UNIQUE (id, author_id),
  CONSTRAINT ideas_title_length     CHECK (char_length(btrim(title)) BETWEEN 5 AND 150),
  CONSTRAINT ideas_summary_length   CHECK (char_length(btrim(summary)) BETWEEN 20 AND 1000),
  CONSTRAINT ideas_details_length   CHECK (details IS NULL OR char_length(details) <= 20000),
  CONSTRAINT ideas_published_at     CHECK (status = 'draft' OR published_at IS NOT NULL)
);
CREATE INDEX ideas_open_idx   ON ideas (published_at DESC, id DESC) WHERE status = 'open' AND deleted_at IS NULL;
CREATE INDEX ideas_author_idx ON ideas (author_id, created_at DESC);

CREATE TRIGGER ideas_set_updated_at BEFORE UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION ideas_before_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.author_id <> OLD.author_id THEN
    RAISE EXCEPTION 'ideas.author_id is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER ideas_before_update BEFORE UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION ideas_before_update();

-- Roles the idea needs (drives skill-gap / team-composition matching).
CREATE TABLE idea_roles_needed (
  idea_id    uuid        NOT NULL REFERENCES ideas (id) ON DELETE CASCADE,
  role_id    smallint    NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (idea_id, role_id)
);
CREATE INDEX idea_roles_needed_role_idx ON idea_roles_needed (role_id);

-- One embedding per idea, produced asynchronously by a worker.
-- A missing row means "needs (re-)embedding".
CREATE TABLE idea_embeddings (
  idea_id       uuid        PRIMARY KEY REFERENCES ideas (id) ON DELETE CASCADE,
  model         text        NOT NULL DEFAULT 'all-MiniLM-L6-v2',
  embedding     vector(384) NOT NULL,
  source_sha256 text        NOT NULL,   -- hash of the exact text that was embedded
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- Mixing models in one index silently breaks similarity. Changing model
  -- is a deliberate migration, not an accident.
  CONSTRAINT idea_embeddings_model CHECK (model = 'all-MiniLM-L6-v2'),
  CONSTRAINT idea_embeddings_sha256_format CHECK (source_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX idea_embeddings_hnsw_idx ON idea_embeddings USING hnsw (embedding vector_cosine_ops);

-- When the embedded text (title + summary) changes, drop the stale vector so
-- the worker re-embeds it. details is deliberately not embedded.
CREATE FUNCTION ideas_invalidate_embedding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM idea_embeddings WHERE idea_id = NEW.id;
  RETURN NULL;
END $$;

CREATE TRIGGER ideas_invalidate_embedding
  AFTER UPDATE OF title, summary ON ideas
  FOR EACH ROW
  WHEN (NEW.title IS DISTINCT FROM OLD.title OR NEW.summary IS DISTINCT FROM OLD.summary)
  EXECUTE FUNCTION ideas_invalidate_embedding();

-- =============================================================================
-- 6. Hubs, NDA agreements and hub discussion
-- =============================================================================

-- Counsel-approved agreement text. Immutable once published.
CREATE TABLE agreement_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version      integer     NOT NULL,
  title        text        NOT NULL,
  body         text        NOT NULL,
  body_sha256  text        NOT NULL,     -- computed by trigger
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT agreement_templates_version_uq  UNIQUE (version),
  CONSTRAINT agreement_templates_id_hash_uq  UNIQUE (id, body_sha256),
  CONSTRAINT agreement_templates_version_pos CHECK (version > 0),
  CONSTRAINT agreement_templates_body_nonempty CHECK (char_length(btrim(body)) > 0)
);

CREATE FUNCTION agreement_templates_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'published agreement templates are immutable; create a new version';
  END IF;
  NEW.body_sha256 := encode(sha256(convert_to(NEW.body, 'UTF8')), 'hex');
  RETURN NEW;
END $$;

CREATE TRIGGER agreement_templates_guard BEFORE INSERT OR UPDATE ON agreement_templates
  FOR EACH ROW EXECUTE FUNCTION agreement_templates_guard();

-- A discussion-and-build space created from an idea.
CREATE TABLE hubs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id               uuid        NOT NULL,
  owner_id              uuid        NOT NULL,
  name                  text        NOT NULL,
  description           text,
  agreement_template_id uuid        NOT NULL REFERENCES agreement_templates (id) ON DELETE RESTRICT,
  status                hub_status  NOT NULL DEFAULT 'active',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  archived_at           timestamptz,

  CONSTRAINT hubs_one_per_idea_uq UNIQUE (idea_id),
  -- The hub owner must be the idea's author.
  CONSTRAINT hubs_idea_owner_fk
    FOREIGN KEY (idea_id, owner_id) REFERENCES ideas (id, author_id) ON DELETE RESTRICT,
  CONSTRAINT hubs_name_length        CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT hubs_description_length CHECK (description IS NULL OR char_length(description) <= 2000),
  CONSTRAINT hubs_archived_at        CHECK ((status = 'archived') = (archived_at IS NOT NULL))
);
CREATE INDEX hubs_owner_idx ON hubs (owner_id);

CREATE TRIGGER hubs_set_updated_at BEFORE UPDATE ON hubs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION hubs_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.idea_id <> OLD.idea_id OR NEW.owner_id <> OLD.owner_id
                           OR NEW.agreement_template_id <> OLD.agreement_template_id) THEN
    RAISE EXCEPTION 'hubs.idea_id, owner_id and agreement_template_id are immutable';
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (
       SELECT 1 FROM agreement_templates
        WHERE id = NEW.agreement_template_id AND published_at IS NOT NULL) THEN
    RAISE EXCEPTION 'hub must use a published agreement template';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER hubs_before_write BEFORE INSERT OR UPDATE ON hubs
  FOR EACH ROW EXECUTE FUNCTION hubs_before_write();

-- Signed IP Protection & NDA. Append-only legal evidence.
CREATE TABLE agreement_signatures (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id            uuid        NOT NULL REFERENCES hubs (id) ON DELETE RESTRICT,
  user_id           uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  template_id       uuid        NOT NULL,
  template_sha256   text        NOT NULL,
  signed_legal_name text        NOT NULL,
  terms_snapshot    jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- hub-specific terms (e.g. ownership split) as signed
  signed_at         timestamptz NOT NULL DEFAULT now(),
  ip_address        inet,
  user_agent        text,

  -- The signer saw exactly this text: id + hash must match the template.
  CONSTRAINT agreement_signatures_template_fk
    FOREIGN KEY (template_id, template_sha256)
    REFERENCES agreement_templates (id, body_sha256) ON DELETE RESTRICT,
  CONSTRAINT agreement_signatures_once_uq       UNIQUE (hub_id, user_id, template_id),
  -- Target of the hub_members composite FK.
  CONSTRAINT agreement_signatures_member_ref_uq UNIQUE (id, hub_id, user_id),
  CONSTRAINT agreement_signatures_legal_name    CHECK (char_length(btrim(signed_legal_name)) BETWEEN 2 AND 200),
  CONSTRAINT agreement_signatures_terms_object  CHECK (jsonb_typeof(terms_snapshot) = 'object')
);
CREATE INDEX agreement_signatures_user_idx ON agreement_signatures (user_id);

CREATE FUNCTION agreement_signatures_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hubs
                  WHERE id = NEW.hub_id AND agreement_template_id = NEW.template_id) THEN
    RAISE EXCEPTION 'signature must be for the hub''s agreement template';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER agreement_signatures_before_insert BEFORE INSERT ON agreement_signatures
  FOR EACH ROW EXECUTE FUNCTION agreement_signatures_before_insert();
CREATE TRIGGER agreement_signatures_append_only BEFORE UPDATE OR DELETE ON agreement_signatures
  FOR EACH ROW EXECUTE FUNCTION reject_modification();

CREATE TABLE hub_members (
  hub_id       uuid              NOT NULL REFERENCES hubs (id) ON DELETE RESTRICT,
  user_id      uuid              NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  member_role  hub_member_role   NOT NULL DEFAULT 'member',
  status       hub_member_status NOT NULL,
  invited_by   uuid              REFERENCES users (id) ON DELETE RESTRICT,
  signature_id uuid,
  created_at   timestamptz       NOT NULL DEFAULT now(),   -- request / invite time
  joined_at    timestamptz,
  left_at      timestamptz,
  updated_at   timestamptz       NOT NULL DEFAULT now(),

  PRIMARY KEY (hub_id, user_id),
  -- THE NDA GATE: the signature must belong to this same hub and this same user.
  CONSTRAINT hub_members_signature_fk
    FOREIGN KEY (signature_id, hub_id, user_id)
    REFERENCES agreement_signatures (id, hub_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT hub_members_active_requires_signature
    CHECK (status <> 'active' OR (signature_id IS NOT NULL AND joined_at IS NOT NULL)),
  CONSTRAINT hub_members_left_at
    CHECK ((status IN ('left', 'removed')) = (left_at IS NOT NULL)),
  CONSTRAINT hub_members_not_self_invited
    CHECK (invited_by IS NULL OR invited_by <> user_id)
);
CREATE UNIQUE INDEX hub_members_one_owner_uq ON hub_members (hub_id) WHERE member_role = 'owner';
CREATE INDEX hub_members_user_idx ON hub_members (user_id, status);

CREATE TRIGGER hub_members_set_updated_at BEFORE UPDATE ON hub_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Checked at COMMIT: a new hub must have its owner as an owner-member.
-- (Hub, owner signature and owner membership are created in one transaction.)
CREATE FUNCTION hubs_require_owner_member() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hub_members
                  WHERE hub_id = NEW.id AND user_id = NEW.owner_id AND member_role = 'owner') THEN
    RAISE EXCEPTION 'hub % has no owner membership row for its owner', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER hubs_require_owner_member
  AFTER INSERT ON hubs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION hubs_require_owner_member();

-- Flat hub chat with optional quote-reply (not a threaded tree).
CREATE TABLE hub_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id      uuid        NOT NULL REFERENCES hubs (id) ON DELETE RESTRICT,
  author_id   uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  reply_to_id uuid,
  body        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  edited_at   timestamptz,
  deleted_at  timestamptz,

  CONSTRAINT hub_messages_hub_id_uq UNIQUE (hub_id, id),
  -- A quoted message must be in the same hub.
  CONSTRAINT hub_messages_reply_fk
    FOREIGN KEY (hub_id, reply_to_id) REFERENCES hub_messages (hub_id, id),
  CONSTRAINT hub_messages_not_self_reply CHECK (reply_to_id IS NULL OR reply_to_id <> id),
  CONSTRAINT hub_messages_body_length    CHECK (char_length(body) BETWEEN 1 AND 10000)
);
CREATE INDEX hub_messages_timeline_idx ON hub_messages (hub_id, created_at DESC, id DESC);

CREATE TRIGGER hub_messages_set_updated_at BEFORE UPDATE ON hub_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Only active (NDA-signed) members of an active hub can post.
-- FOR SHARE blocks a concurrent removal until this insert commits.
CREATE FUNCTION hub_messages_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM hubs WHERE id = NEW.hub_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hub is not active' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM hub_members
   WHERE hub_id = NEW.hub_id AND user_id = NEW.author_id AND status = 'active'
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only active hub members who signed the agreement can post'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER hub_messages_before_insert BEFORE INSERT ON hub_messages
  FOR EACH ROW EXECUTE FUNCTION hub_messages_before_insert();

CREATE FUNCTION hub_messages_before_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hub_id <> OLD.hub_id OR NEW.author_id <> OLD.author_id
     OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'hub message identity columns are immutable';
  END IF;
  IF NEW.body <> OLD.body THEN
    IF OLD.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'cannot edit a deleted message';
    END IF;
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER hub_messages_before_update BEFORE UPDATE ON hub_messages
  FOR EACH ROW EXECUTE FUNCTION hub_messages_before_update();

-- =============================================================================
-- 7. Developer Exchange Feed: posts
-- =============================================================================

CREATE TABLE posts (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       uuid            NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  type            post_type       NOT NULL DEFAULT 'general',
  title           text,
  body            text            NOT NULL,
  link_url        text,                                   -- the whiteboard's postUrl
  hub_id          uuid            REFERENCES hubs (id) ON DELETE RESTRICT,  -- only for hub_milestone posts
  like_count      integer         NOT NULL DEFAULT 0,     -- maintained by trigger
  comment_count   integer         NOT NULL DEFAULT 0,     -- non-deleted comments, maintained by trigger
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  deleted_by      uuid            REFERENCES users (id) ON DELETE RESTRICT,
  deletion_reason deletion_reason,

  CONSTRAINT posts_body_length    CHECK (char_length(body) BETWEEN 1 AND 20000),
  CONSTRAINT posts_title_length   CHECK (title IS NULL OR char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT posts_rfc_has_title  CHECK (type <> 'rfc' OR title IS NOT NULL),
  CONSTRAINT posts_link_url       CHECK (link_url IS NULL OR link_url ~ '^https?://'),
  CONSTRAINT posts_milestone_hub  CHECK ((type = 'hub_milestone') = (hub_id IS NOT NULL)),
  CONSTRAINT posts_counts_nonneg  CHECK (like_count >= 0 AND comment_count >= 0),
  CONSTRAINT posts_deletion_pair  CHECK ((deleted_at IS NULL) = (deletion_reason IS NULL))
);
-- Global feed, newest first, keyset pagination on (created_at, id).
CREATE INDEX posts_feed_idx   ON posts (created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_author_idx ON posts (author_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_hub_idx    ON posts (hub_id) WHERE hub_id IS NOT NULL;

CREATE TRIGGER posts_set_updated_at BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Previous versions of edited posts (moderation and dispute evidence).
CREATE TABLE post_revisions (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id     uuid        NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  title       text,
  body        text        NOT NULL,
  link_url    text,
  replaced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX post_revisions_post_idx ON post_revisions (post_id, replaced_at DESC);

CREATE FUNCTION posts_before_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.author_id <> OLD.author_id OR NEW.created_at <> OLD.created_at
     OR NEW.hub_id IS DISTINCT FROM OLD.hub_id THEN
    RAISE EXCEPTION 'posts.author_id, hub_id and created_at are immutable';
  END IF;

  IF (NEW.body, NEW.title, NEW.link_url) IS DISTINCT FROM (OLD.body, OLD.title, OLD.link_url) THEN
    IF OLD.deleted_at IS NOT NULL THEN
      -- Only the retention purge may rewrite a deleted post, and only to the placeholder.
      IF NEW.body <> '[removed]' THEN
        RAISE EXCEPTION 'cannot edit a deleted post';
      END IF;
    ELSE
      INSERT INTO post_revisions (post_id, title, body, link_url)
      VALUES (OLD.id, OLD.title, OLD.body, OLD.link_url);
      NEW.edited_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER posts_before_update BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_before_update();

CREATE TABLE post_topics (
  post_id       uuid    NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  technology_id integer NOT NULL REFERENCES technologies (id) ON DELETE RESTRICT,

  PRIMARY KEY (post_id, technology_id)
);
CREATE INDEX post_topics_technology_idx ON post_topics (technology_id, post_id);

CREATE TABLE post_attachments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid        NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  storage_key text        NOT NULL,      -- object-storage key, not a public URL
  mime_type   text        NOT NULL,
  byte_size   integer     NOT NULL,
  width       integer,
  height      integer,
  position    smallint    NOT NULL,      -- display order; 0..9 caps a post at 10 images
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT post_attachments_storage_key_uq UNIQUE (storage_key),
  CONSTRAINT post_attachments_position_uq    UNIQUE (post_id, position),
  CONSTRAINT post_attachments_mime_type      CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT post_attachments_byte_size      CHECK (byte_size BETWEEN 1 AND 5242880),
  CONSTRAINT post_attachments_dimensions     CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0)),
  CONSTRAINT post_attachments_position_range CHECK (position BETWEEN 0 AND 9)
);

CREATE TABLE post_likes (
  post_id    uuid        NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (post_id, user_id)            -- one like per user per post, enforced by the DB
);
CREATE INDEX post_likes_user_idx ON post_likes (user_id, created_at DESC);

CREATE FUNCTION post_likes_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM posts WHERE id = NEW.post_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'cannot like a deleted or missing post' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER post_likes_before_insert BEFORE INSERT ON post_likes
  FOR EACH ROW EXECUTE FUNCTION post_likes_before_insert();

CREATE FUNCTION post_likes_maintain_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSE
    UPDATE posts SET like_count = like_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER post_likes_maintain_count AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION post_likes_maintain_count();

-- Bookmarks (replaces the whiteboard's users.SavedPosts[] array).
CREATE TABLE saved_posts (
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id    uuid        NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX saved_posts_user_recent_idx ON saved_posts (user_id, created_at DESC);
CREATE INDEX saved_posts_post_idx        ON saved_posts (post_id);

-- =============================================================================
-- 8. Comments, replies and threading
--    Adjacency list (parent_id) + denormalised root_id and depth.
--    Replies are comments with a parent; there is no separate replies table.
-- =============================================================================

CREATE TABLE comments (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         uuid            NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  parent_id       uuid,                                 -- NULL = top-level comment
  root_id         uuid            NOT NULL,             -- top-level ancestor (self for top-level)
  depth           smallint        NOT NULL DEFAULT 0,   -- 0 = top-level
  author_id       uuid            NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  body            text            NOT NULL,
  like_count      integer         NOT NULL DEFAULT 0,   -- maintained by trigger
  reply_count     integer         NOT NULL DEFAULT 0,   -- direct children incl. tombstones
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  deleted_by      uuid            REFERENCES users (id) ON DELETE RESTRICT,
  deletion_reason deletion_reason,

  -- Lets parent/root FKs carry post_id, so a reply can never point at a
  -- comment on a different post.
  CONSTRAINT comments_post_id_uq UNIQUE (post_id, id),
  CONSTRAINT comments_parent_fk
    FOREIGN KEY (post_id, parent_id) REFERENCES comments (post_id, id) ON DELETE CASCADE,
  CONSTRAINT comments_root_fk
    FOREIGN KEY (post_id, root_id)   REFERENCES comments (post_id, id) ON DELETE CASCADE,
  CONSTRAINT comments_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT comments_depth_matches  CHECK ((parent_id IS NULL) = (depth = 0)),
  CONSTRAINT comments_root_matches   CHECK ((parent_id IS NULL) = (root_id = id)),
  CONSTRAINT comments_depth_range    CHECK (depth BETWEEN 0 AND 1000),
  CONSTRAINT comments_body_length    CHECK (char_length(body) BETWEEN 1 AND 5000),
  CONSTRAINT comments_counts_nonneg  CHECK (like_count >= 0 AND reply_count >= 0),
  CONSTRAINT comments_deletion_pair  CHECK ((deleted_at IS NULL) = (deletion_reason IS NULL))
);
-- Top-level comments of a post, oldest first, keyset pagination.
CREATE INDEX comments_top_level_idx ON comments (post_id, created_at, id) WHERE parent_id IS NULL;
-- Direct replies of a comment ("View 12 replies").
CREATE INDEX comments_replies_idx   ON comments (parent_id, created_at, id) WHERE parent_id IS NOT NULL;
-- A whole thread under one top-level comment in one indexed scan.
CREATE INDEX comments_thread_idx    ON comments (root_id, created_at, id);
-- A user's comment history.
CREATE INDEX comments_author_idx    ON comments (author_id, created_at DESC);

CREATE TRIGGER comments_set_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE comment_revisions (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  comment_id  uuid        NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  body        text        NOT NULL,
  replaced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comment_revisions_comment_idx ON comment_revisions (comment_id, replaced_at DESC);

-- Derive root_id/depth from the parent and refuse replies to anything deleted.
-- Lock order is always post -> parent comment, which avoids deadlocks with
-- like/delete paths (they lock a single row).
CREATE FUNCTION comments_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_post_deleted   timestamptz;
  v_parent         record;
BEGIN
  SELECT deleted_at INTO v_post_deleted
    FROM posts WHERE id = NEW.post_id
    FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post % does not exist', NEW.post_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_post_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'cannot comment on a deleted post' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.parent_id IS NULL THEN
    NEW.depth   := 0;
    NEW.root_id := NEW.id;
  ELSE
    SELECT post_id, root_id, depth, deleted_at INTO v_parent
      FROM comments WHERE id = NEW.parent_id
      FOR NO KEY UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'parent comment % does not exist', NEW.parent_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_parent.post_id <> NEW.post_id THEN
      RAISE EXCEPTION 'reply must be on the same post as its parent'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_parent.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'cannot reply to a deleted comment' USING ERRCODE = 'check_violation';
    END IF;
    NEW.depth   := v_parent.depth + 1;
    NEW.root_id := v_parent.root_id;
  END IF;

  -- Counters always start at zero regardless of what the client sent.
  NEW.like_count  := 0;
  NEW.reply_count := 0;
  RETURN NEW;
END $$;

CREATE TRIGGER comments_before_insert BEFORE INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_before_insert();

-- Tree position is immutable: a parent can only be set at insert time, and a
-- parent always exists before its child, so cycles are impossible.
CREATE FUNCTION comments_before_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.post_id <> OLD.post_id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.root_id <> OLD.root_id OR NEW.depth <> OLD.depth
     OR NEW.author_id <> OLD.author_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'comment tree position, author and created_at are immutable';
  END IF;

  IF NEW.body <> OLD.body THEN
    IF OLD.deleted_at IS NOT NULL THEN
      IF NEW.body <> '[removed]' THEN
        RAISE EXCEPTION 'cannot edit a deleted comment';
      END IF;
    ELSE
      INSERT INTO comment_revisions (comment_id, body) VALUES (OLD.id, OLD.body);
      NEW.edited_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER comments_before_update BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_before_update();

-- Counters:
--   comments.reply_count  = direct children rows, including tombstones
--                           (so a deleted reply's own replies stay reachable)
--   posts.comment_count   = comments that are not deleted
CREATE FUNCTION comments_maintain_counts() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    IF NEW.parent_id IS NOT NULL THEN
      UPDATE comments SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE posts SET comment_count = comment_count - 1 WHERE id = NEW.post_id;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN          -- hard delete (admin purge)
    IF OLD.deleted_at IS NULL THEN
      UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
    END IF;
    IF OLD.parent_id IS NOT NULL THEN
      UPDATE comments SET reply_count = reply_count - 1 WHERE id = OLD.parent_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER comments_maintain_counts_ins AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_maintain_counts();
CREATE TRIGGER comments_maintain_counts_upd AFTER UPDATE OF deleted_at ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_maintain_counts();
CREATE TRIGGER comments_maintain_counts_del AFTER DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_maintain_counts();

-- Likes on comments and replies alike (a reply is a comment).
CREATE TABLE comment_likes (
  comment_id uuid        NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX comment_likes_user_idx ON comment_likes (user_id, created_at DESC);

CREATE FUNCTION comment_likes_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM comments WHERE id = NEW.comment_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'cannot like a deleted or missing comment' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER comment_likes_before_insert BEFORE INSERT ON comment_likes
  FOR EACH ROW EXECUTE FUNCTION comment_likes_before_insert();

CREATE FUNCTION comment_likes_maintain_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
  ELSE
    UPDATE comments SET like_count = like_count - 1 WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER comment_likes_maintain_count AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW EXECUTE FUNCTION comment_likes_maintain_count();

-- =============================================================================
-- 9. Account deletion: anonymise, never hard-delete a user who has content
-- =============================================================================

CREATE FUNCTION anonymize_user(p_user_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user % does not exist', p_user_id;
  END IF;

  -- Personal activity: removed (triggers keep like counts correct).
  DELETE FROM post_likes        WHERE user_id = p_user_id;
  DELETE FROM comment_likes     WHERE user_id = p_user_id;
  DELETE FROM saved_posts       WHERE user_id = p_user_id;
  DELETE FROM user_feed_topics  WHERE user_id = p_user_id;
  DELETE FROM user_technologies WHERE user_id = p_user_id;
  DELETE FROM user_identities   WHERE user_id = p_user_id;   -- can no longer log in

  -- Leave hubs; withdraw pending requests/invites.
  UPDATE hub_members SET status = 'left', left_at = now()
   WHERE user_id = p_user_id AND status = 'active';
  UPDATE hub_members SET status = 'declined'
   WHERE user_id = p_user_id AND status IN ('requested', 'invited');

  -- Stop new matches on their ideas; the ideas and hubs themselves stay.
  UPDATE ideas SET status = 'closed'
   WHERE author_id = p_user_id AND status = 'open';

  -- Scrub the profile. Posts, comments, verification history and NDA
  -- signatures remain and now show "Deleted user".
  UPDATE users
     SET username          = 'deleted-' || substr(replace(id::text, '-', ''), 1, 12),
         display_name      = 'Deleted user',
         first_name        = NULL,
         last_name         = NULL,
         email             = NULL,
         email_verified_at = NULL,
         avatar_url        = NULL,
         bio               = NULL,
         deleted_at        = COALESCE(deleted_at, now())
   WHERE id = p_user_id;
END $$;

-- =============================================================================
-- 10. Seed data: job roles (PRD §7.1 tracks) and a starter set of technologies
-- =============================================================================

INSERT INTO roles (slug, name) VALUES
  ('frontend-engineer',     'Frontend Engineer'),
  ('backend-engineer',      'Backend & Systems Engineer'),
  ('mobile-engineer',       'Mobile Engineer'),
  ('ai-ml-engineer',        'AI / ML Engineer'),
  ('mlops-data-engineer',   'MLOps & Data Engineer'),
  ('devops-cloud-engineer', 'DevOps & Cloud Engineer'),
  ('embedded-iot-engineer', 'Embedded Systems & IoT Engineer'),
  ('security-engineer',     'Cybersecurity & Smart Contract Auditor'),
  ('ui-ux-engineer',        'UI/UX Engineer & Product Architect');

INSERT INTO technologies (slug, name) VALUES
  ('react', 'React'), ('vue', 'Vue'), ('go', 'Go'), ('rust', 'Rust'),
  ('nodejs', 'Node.js'), ('python', 'Python'), ('java', 'Java'),
  ('flutter', 'Flutter'), ('react-native', 'React Native'),
  ('pytorch', 'PyTorch'), ('tensorflow', 'TensorFlow'), ('llms', 'LLMs'),
  ('computer-vision', 'Computer Vision'), ('postgresql', 'PostgreSQL'),
  ('vector-databases', 'Vector Databases'), ('kubernetes', 'Kubernetes'),
  ('docker', 'Docker'), ('terraform', 'Terraform'), ('ci-cd', 'CI/CD');

COMMIT;
