-- The demo's hubs move from the test agreement (version 1) to the hub agreement (version 2).
-- A hub keeps the agreement it was created on, and a signature is never rewritten, so a demo
-- seeded before version 2 would show "TEST AGREEMENT (NOT LEGAL TEXT)" for ever. The demo's
-- signatures are not records of anything: the seed wrote them for made-up people. So this
-- script, and only this script, rewrites them.
-- Why: docs/decisions/2026-11-15-demo-hubs-on-agreement-v2.md
--
-- What it touches: hubs on version 1 whose owner is a demo account (users.is_demo) and in which
-- every signature is a demo account's. Their agreement and their signatures point at version 2
-- afterwards. A real person's hub or signature is never touched, and nothing is deleted.
--
-- How: the two triggers that refuse these changes are switched off and on again inside one
-- statement. If anything fails, the whole statement is undone, the triggers included.
-- ALTER TABLE holds a lock that keeps every other writer out of both tables until it ends, so
-- no other change gets past the triggers meanwhile.
--
-- Runs after 020-hub-agreement-v2.sql, and says so: when there is a demo hub to move and
-- version 2 is not the published "Village Sqwhere hub agreement", it stops with an error instead
-- of passing as done. Running it twice is safe: the second run finds no demo hub it may move
-- and changes nothing. It never moves a hub off a later version.

DO $$
DECLARE
  v2    record;
  moved uuid[];
BEGIN
  SELECT array_agg(h.id) INTO moved
    FROM hubs h
    JOIN users owner ON owner.id = h.owner_id
    JOIN agreement_templates t ON t.id = h.agreement_template_id
   WHERE owner.is_demo
     AND t.version = 1
     AND NOT EXISTS (
           SELECT 1
             FROM agreement_signatures s
             JOIN users signer ON signer.id = s.user_id
            WHERE s.hub_id = h.id AND NOT signer.is_demo);
  IF moved IS NULL THEN
    RETURN;
  END IF;

  -- the title too: a database the API tests ran in can hold a test template numbered 2
  SELECT id, body_sha256 INTO v2
    FROM agreement_templates
   WHERE version = 2 AND published_at IS NOT NULL AND title = 'Village Sqwhere hub agreement';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the hub agreement, version 2, is not published here: run 020-hub-agreement-v2.sql first, then this script again';
  END IF;

  ALTER TABLE hubs DISABLE TRIGGER hubs_before_write;
  ALTER TABLE agreement_signatures DISABLE TRIGGER agreement_signatures_append_only;

  UPDATE agreement_signatures
     SET template_id = v2.id, template_sha256 = v2.body_sha256
   WHERE hub_id = ANY (moved);
  UPDATE hubs
     SET agreement_template_id = v2.id
   WHERE id = ANY (moved);

  ALTER TABLE hubs ENABLE TRIGGER hubs_before_write;
  ALTER TABLE agreement_signatures ENABLE TRIGGER agreement_signatures_append_only;
END $$;
