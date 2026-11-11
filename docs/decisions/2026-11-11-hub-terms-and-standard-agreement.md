# Hub terms live on the hub, one standard agreement, a test text for now

## Context

A hub owner sets terms for their hub, for example how ownership is shared:
`{"ownership_model": "equal_split"}`. Every member who joins signs an agreement, and the
signature must record exactly what was agreed. Three questions came up:

- Where do the terms live, and can they change after people signed?
- Is the agreement text different for each hub?
- Hubs can only be created on a published row in `agreement_templates`, and the database had
  none. What do we use until the real text exists?

## Decision

Chosen in this pull request, for the team to confirm in review. The team approved the change
to `infra/`.

- **Terms live on the hub and are frozen.** `hubs.terms` is a JSON object, set when the hub is
  created. The database refuses any later change, because members have signed those terms.
  The database copies the hub's terms into every signature's `terms_snapshot`, whatever the
  client sent, so every member signs exactly the same terms and a client can never sign
  different ones.
- **One standard agreement for all hubs,** written by our team. The hub owner's choices go in
  the terms, not in the legal text. The text is a row in `agreement_templates`, and a published
  row cannot be edited, so a change to the text is a new version.
- **A clearly fake test agreement for now.** `infra/db/init/004-test-agreement.sql` inserts
  version 1, titled "TEST AGREEMENT (NOT LEGAL TEXT)", so hubs can be built and tested. The real
  text is published later as version 2, and the test text must not reach real users.

## Options we considered

- **Terms in a separate table, or inside the signature only.** Not chosen: every member must
  sign the same terms, so one copy on the hub is the single source, and the signature keeps a
  snapshot as evidence.
- **Let the API copy the terms into the signature.** Not chosen: a bug or a changed client
  could then record different terms. The database trigger makes that impossible.
- **Editable terms with a new signature round.** Not chosen for now: it needs a product
  decision about what happens to members who have signed. Frozen terms are the simpler rule.
- **A different agreement text per hub.** Not chosen: one text reviewed once is safer than many
  texts nobody reviewed.
- **Wait for the real text before creating hubs.** Not chosen: the hub feature could not be
  built or tested without a published template.

## Consequences

- Everyone must rebuild their local database to get the two new scripts (`down -v`, then
  `pnpm db:up`). The steps are in `infra/README.md`.
- A mistake in a hub's terms cannot be fixed by editing them. Today that means a new hub.
- The test agreement must be replaced before launch. Hubs created on version 1 keep pointing at
  the test text, so any hub made before launch is test data.
- The API has no hub models, schemas or routes yet. They come in the next pull request.
