# The demo world reads as real

## Context

The demo account is read only for visitors, and its world is written by the seed
(`apps/api/app/demo_seed.py`). A sweep of every screen the demo account can open found content
that says nothing wrong word by word but cannot be true together, or that no person would have
written. Examples: a hub page saying "You signed version 2 on the day the demo was seeded"
under "Member since ten days earlier"; a review case with no repositories and no report; hubs
described as "Building tontine numérique pour dakar together."; a French note written in
Kumasi; a team chat with ten days of work and no message.

Tanny's rule (15 November 2026): the demo bar in the web frame is the only place that says the
demo is made up. Everything the seed writes must read like the real product in real use. It
must not say or look like test, placeholder, sample, example, made up, fake or demo, hold no
filler text, and state no facts that cannot be true together.

## Decision

The seed is corrected in eight places, each on a new world and on a world seeded earlier and
rerun:

1. **Signature dates.** A signature is dated the moment its member joined. A new world gets
   this from the seed. A world seeded earlier gets it from one script,
   `infra/db/init/026-demo-signature-dates.sql`.
2. **The review case.** Tendai's attempt holds three repositories, the repository check, the
   interview and the AI's report, in English and without a name, because the review screen is
   anonymous. The addresses use the owner `tm_codes`: GitHub never allows an underscore, so
   they can never be a stranger's code. A rerun fills the attempt only while it is empty and
   still awaiting review.
3. **Hub descriptions.** Each hub has its own two or three sentences in its owner's language,
   saying what the team builds first. A rerun replaces a description that still matches the old
   template, and leaves one that anyone wrote since.
4. **The Tontine post.** "Nous recrutons une personne backend" is replaced by a post about the
   tontine's progress. It was dated after the visitor joined that hub, and the product is about
   building together, never about hiring.
5. **Languages.** Kwabena (Kumasi) and the visitor (Lagos) write English. Aminata (Dakar) and
   Uwase (Kigali) write French. A rerun rewrites the two old French notes by their text.
6. **Team chats.** The Payouts hub and the Tontine hub each get a short conversation that fits
   the hub's history. A rerun writes it only into a chat that is empty, and counts its times from
   the hub's stored history (joining, phase moves, claims), not from the day of the rerun.
7. **The build tab.** Every claim is older than the first commit of its holder, and no commit
   claims ledger work while nobody holds the "Ledger database" piece. A rerun brings an older
   world's claim times and commits to the same state.
8. **Fresh commits.** The commits and the "Checked" time are written again on every run, the
   way a refresh replaces them, so a demo seeded days ago never reads "Checked 3 days ago".

**Why a script for the signature dates.** `agreement_signatures` is append-only, so a rerun
meets the trigger that refuses the change. The script follows
`2026-11-15-demo-hubs-on-agreement-v2.md`: it touches only signatures made by demo accounts
(`users.is_demo`) in hubs owned by demo accounts, switches the trigger off and on again inside
one statement, and leaves a database with nothing to change alone, trigger included. A real
person's signature is never touched, and running it twice changes nothing more.

## Options we considered

- **Leave the dates.** The hub page would keep showing a signature after ten days of work.
- **Delete the demo and seed it again.** The triggers on signatures, hubs and phase moves
  refuse the deletes, and the visitor's account, ideas and links would have to be made again.

## Consequences

- A demo hub reads as one team's ten days: the signature, the joining, the notes, the sketch,
  the chat and the commits agree.
- The seed now holds a little more made-up text, which has to stay in step with the people's
  countries and languages. The tests check the languages, the order of the chat and the claims.
- A claim held by someone else is left with them, and a chat with one real message is never
  written over.
- If the agreement or the hub's history changes, the seed and its tests change with it, not
  the database, except for a date that a signature already fixed.
