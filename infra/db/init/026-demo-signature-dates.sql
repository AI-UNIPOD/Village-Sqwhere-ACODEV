-- The demo's signatures are dated the day the demo was seeded, not the day each member joined.
-- The seed wrote joined_at ten days back and left signed_at to its default, so a hub page said
-- "You signed version 2 of the agreement on <seed day>" under "Member since <ten days earlier>".
-- A signature is never rewritten (the database refuses it), so the seed cannot fix this on a
-- rerun. The demo's signatures are not records of anything: the seed wrote them for made-up
-- people. So this script, and only this script, rewrites their date.
-- Why: docs/decisions/2026-11-15-demo-world-reads-as-real.md
--
-- What it touches: signatures made by a demo account (users.is_demo) in a hub owned by a demo
-- account, dated later than the moment that member joined. Their date becomes the moment they
-- joined. A real person's signature is never touched, and nothing is deleted.
--
-- How: the trigger that refuses the change is switched off and on again inside one statement.
-- If anything fails, the whole statement is undone, the trigger included. ALTER TABLE holds a
-- lock that keeps every other writer out of the table until it ends, so no other change gets
-- past the trigger meanwhile.
--
-- Running it twice is safe: the second run finds no signature dated after its member joined and
-- changes nothing, trigger included. It never makes a signature later.

DO $$
DECLARE
  late uuid[];
BEGIN
  SELECT array_agg(s.id) INTO late
    FROM agreement_signatures s
    JOIN hub_members m ON m.signature_id = s.id
    JOIN users signer ON signer.id = s.user_id
    JOIN hubs h ON h.id = s.hub_id
    JOIN users owner ON owner.id = h.owner_id
   WHERE signer.is_demo
     AND owner.is_demo
     AND s.signed_at > m.joined_at;
  IF late IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE agreement_signatures DISABLE TRIGGER agreement_signatures_append_only;

  UPDATE agreement_signatures s
     SET signed_at = m.joined_at
    FROM hub_members m
   WHERE m.signature_id = s.id
     AND s.id = ANY (late);

  ALTER TABLE agreement_signatures ENABLE TRIGGER agreement_signatures_append_only;
END $$;
