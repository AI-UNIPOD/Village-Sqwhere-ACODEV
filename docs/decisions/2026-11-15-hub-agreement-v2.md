# The hub agreement, version 2, is published

## Context

Every hub is created on a published agreement that its owner and each member sign by typing
their legal name. Until now the only published text was version 1, a test text that said it
was not legal text (`2026-11-11-hub-terms-and-standard-agreement.md`), and the hub pages
carried a warning that the real agreement would replace it before launch. Replacing it was a
launch item in `docs/PROGRESS.md`.

## Decision

Tanny decided on 15 November 2026:

- **Version 2 is written now and goes live now.** It replaces the test text for every new hub,
  in the same change that publishes it. A person will review the wording later; the text is
  written to be read as the finished agreement, not as a stub.
- **The warning on the hub pages goes.** With a real text there is nothing to warn about. The
  web change that removes it is its own pull request.

What the text says, in the product's plain voice (`infra/db/init/020-hub-agreement-v2.sql`):
who agrees (the idea's owner and the hub's members; Village Sqwhere is not a party), that the
brief and the work are confidential, that the idea is the owner's and the work is owned as the
hub's terms say, what a member may contribute and the right they give the others to use it,
what happens when a member leaves or is removed, that nobody is hired or paid, how
disagreements are handled, and what a signature records. Every statement about the product
matches what the code does: the terms cannot change after the hub is created, each signature
keeps the terms as they were seen, the name, the time, the text's fingerprint and the
connection details are recorded, and a hub keeps the version it was created on.

Choices the build made while writing it, for the reviewer to confirm or change in a version 3:

- **One text in two languages.** The agreement is stored as one body, so it holds the English
  text and then the same text in French. It says that if the two differ, the English applies.
- **Confidentiality has no end date.** It lasts for as long as the information is not public.
- **A member who leaves keeps their share in the work done up to that day,** and has none in
  what is built after, unless the hub's terms say otherwise.
- **No country's law and no court are named.** Members try to agree, may ask a neutral person,
  and keep their right to go to a court that can decide.
- **The signature clause says the typed name counts as the person's signature.** Whether that
  is enough in a given country is for the reviewer.
- **No contact address is given.** A misuse of the platform is reported "to the Village Sqwhere
  team", because the product has no published contact yet.

## Options we considered

- **Keep the test text until a lawyer has reviewed a real one.** Safer legally, but every hub
  made in the meantime is signed on a text that says it means nothing, and the page says so to
  every visitor. Tanny chose to publish now and review after.
- **Publish version 2 and keep one line saying it has not been reviewed by a lawyer.** Offered
  to Tanny, who chose to remove every warning.
- **Two templates, one per language.** The schema has one current template for everyone and a
  hub signs one text, so two would need a schema change and a rule for mixed-language teams.

## Consequences

- New hubs are created on version 2 at once (the API takes the published template with the
  highest version). Hubs created on version 1 keep it: a published template is never edited,
  and their members signed that text. The test text is still in the database for them.
- People now sign a text that reads as a real agreement and that nobody qualified has reviewed.
  The review is still owed, and its changes can only arrive as version 3, for hubs created
  after it.
- The agreement names features by what they do (the brief, the terms, leaving, archiving). If
  one of them changes, the next version of the text must change with it.
