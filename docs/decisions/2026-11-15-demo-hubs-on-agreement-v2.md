# The demo's hubs are moved to agreement version 2

## Context

A hub keeps the agreement it was created on, and the database refuses to change it: a trigger
makes `hubs.agreement_template_id` immutable, and `agreement_signatures` is append-only. That
is right for real hubs, where a signature records what a person read and accepted.

The demo's hubs are written by the seed (`apps/api/app/demo_seed.py`) for made-up people. A
demo seeded before version 2 was published sits on version 1, the test text, so the demo hub
showed "TEST AGREEMENT (NOT LEGAL TEXT)" and would have kept showing it. The seed cannot fix
that on a rerun, because it meets the same two triggers.

Tanny decided on 15 November 2026 that the demo hub must not show the test text: everything
in the demo should look like the real thing, with nothing that says placeholder or test.

## Decision

One script, `infra/db/init/022-demo-hubs-agreement-v2.sql`, moves the demo's hubs from
version 1 to version 2: the hub's agreement, and each signature in it (the agreement it points
at and the fingerprint of the text).

- **Only the demo.** A hub is moved when its owner is a demo account (`users.is_demo`), it is
  on version 1, and every signature in it is a demo account's. A real person's hub or
  signature is never touched.
- **Nothing is deleted.** The same rows point at the newer text.
- **The triggers stay.** The script switches the two triggers off and on again inside one
  statement, which either finishes whole or is undone whole. The lock it takes keeps other
  writers out of both tables until it ends.
- **It is not a tool.** It moves from version 1 to version 2 and nothing else. A hub on a
  later version is never moved back, and a second run changes nothing.
- **It fails out loud.** When a demo hub is waiting to be moved and version 2 is not the
  published "Village Sqwhere hub agreement", the script stops with an error that names script
  020, so it is never recorded as done while the demo still shows the test text.
- **It writes no demo content.** `2026-11-13-read-only-demo.md` keeps made-up rows out of
  `infra/db/init/`, and that still holds: on a database with no demo this script does nothing.

The same day a second script, `infra/db/init/026-demo-signature-dates.sql`, corrects the date
of the demo's signatures in the same way and under the same limits. The seed dated each
member's joining ten days back and left the signature's date to its default, the day the seed
ran, so a hub page said "You signed the agreement on 13 November" under "Member since 3
November", after ten days of notes, a sketch and commits. The seed now dates a new demo's
signatures at the joining. For a demo that already exists, the script sets a demo account's
signature, in a hub a demo account owns, to the moment that member joined, when it is later.

## Options we considered

- **Delete the demo and seed it again.** The same two triggers, and the one on
  `hub_phase_moves`, refuse the deletes, so it needs the same switch and removes far more rows.
- **Let the triggers always allow changes to demo rows.** That puts a permanent exception into
  the rules that protect real signatures, for a need that comes up once.
- **Leave old demos as they are.** A database seeded from nothing gets version 2 anyway, but
  the preview, and any database seeded before today, would keep the test text.

## Consequences

- After the script, the demo hub shows "Village Sqwhere hub agreement", version 2, and "the
  exact text you signed" is still true for each made-up member: the fingerprint matches.
- A demo signature's date can be earlier than the day version 2 was published. Nothing on the
  pages shows the two dates together.
- A hub that a real account created on version 1 keeps the test text: its members signed that
  text, and this script leaves it alone. Development databases hold such hubs. Whoever runs a
  database that real people used before version 2 decides what to tell those teams.
- If the agreement changes again, the demo needs the same kind of move, in a new script. The
  honest way to avoid that is for the seed to build the demo once, on the current text.
