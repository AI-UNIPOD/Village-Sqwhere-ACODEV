-- Sectors: the areas a developer wants to build for (fintech, health, ...). Onboarding asks for
-- them next to the stack. Names are English; the web app keeps its own French name by slug.
--
-- Runs after 002-schema.sql. Running it twice is safe, so a database made before it can run
-- it once by hand (see infra/README.md).

CREATE TABLE IF NOT EXISTS sectors (
  id         smallint    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text        NOT NULL,
  name       text        NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sectors_slug_uq     UNIQUE (slug),
  CONSTRAINT sectors_name_uq     UNIQUE (name),
  CONSTRAINT sectors_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE TABLE IF NOT EXISTS user_sectors (
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  sector_id  smallint    NOT NULL REFERENCES sectors (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, sector_id)
);

-- The onboarding list (apps/web/app/onboarding/options.ts), in its order.
INSERT INTO sectors (slug, name) VALUES
  ('fintech',            'Fintech'),
  ('agritech',           'Agritech'),
  ('health',             'Health'),
  ('education',          'Education'),
  ('climate-energy',     'Climate and energy'),
  ('mobility-logistics', 'Mobility and logistics'),
  ('commerce',           'Commerce'),
  ('civic',              'Civic tech and public services'),
  ('media-culture',      'Media and culture'),
  ('developer-tools',    'Developer tools')
ON CONFLICT (slug) DO NOTHING;
