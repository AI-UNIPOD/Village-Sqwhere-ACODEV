-- Hub terms: the deal a hub owner sets for their own hub (for example the ownership split,
-- {"ownership_model": "equal_split"}). They are set when the hub is created, frozen
-- afterwards, and copied into every member's signature, so every member signs exactly the
-- same terms.
--
-- Runs after 002-schema.sql, on an empty database (see infra/README.md).

ALTER TABLE hubs ADD COLUMN terms jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE hubs ADD CONSTRAINT hubs_terms_object CHECK (jsonb_typeof(terms) = 'object');

CREATE FUNCTION hubs_terms_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'hub terms are immutable; members signed them'
    USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER hubs_terms_immutable
  BEFORE UPDATE OF terms ON hubs
  FOR EACH ROW
  WHEN (NEW.terms IS DISTINCT FROM OLD.terms)
  EXECUTE FUNCTION hubs_terms_immutable();

-- The database, not the client, decides what a signature's terms are: whatever the client
-- sends for terms_snapshot is replaced by the hub's own terms.
CREATE FUNCTION agreement_signatures_copy_terms() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT terms INTO NEW.terms_snapshot FROM hubs WHERE id = NEW.hub_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signature is for a hub that does not exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER agreement_signatures_copy_terms
  BEFORE INSERT ON agreement_signatures
  FOR EACH ROW EXECUTE FUNCTION agreement_signatures_copy_terms();
