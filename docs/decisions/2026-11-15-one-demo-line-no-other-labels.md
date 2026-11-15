# One line says the demo is made up, and nothing else is labelled

## Context

The signed-in pages carried two kinds of labels about their own content. The demo bar, under
the header of the shared demo account, says the people and ideas are made up and nothing can
be changed. The hub pages also showed a warning above the agreement, "This is placeholder
text, not a legal agreement", whenever the agreement's title contained "TEST"
(`2026-11-13-hub-screens.md`). The demo's ideas each carried a private brief that began
"Made-up plan for the demo".

On 15 November 2026 the hub agreement was published as version 2, a real text
(`2026-11-15-hub-agreement-v2.md`).

## Decision

Tanny decided on 15 November 2026:

- **The demo bar's line stays, and it is the only one.** A visitor in the demo is told once,
  on every screen, that the people and ideas are made up.
- **Every other sample, placeholder or made-up label outside the landing page goes.** The
  warning above the agreement is removed, with its English and French words. The demo ideas'
  private brief no longer starts with "Made-up plan for the demo" (its own pull request, in
  the API's demo seed).
- **The guided tour does not repeat it.** Its first stop was "The demo village", "the village
  of a demo developer". It is now "Your village", and says what a village holds.

The landing page is the landing session's, and its labels are decided there.

## Options we considered

- **Keep the warning for hubs still on version 1.** Those hubs show the test text, whose own
  title and first line say it is not legal text, so the warning repeated what the text says.
  Tanny chose no warning at all.
- **Keep every label.** Honest, but the same thing was said up to three times on one screen,
  and the agreement is no longer a placeholder.

## Consequences

- A hub created before version 2 still shows the test text under its own title, "TEST
  AGREEMENT (NOT LEGAL TEXT)", with nothing added by the page. A published agreement cannot be
  edited and a hub keeps the version it was created on, so those hubs stay that way. A demo
  world seeded before version 2 is one of them until it is seeded again from nothing.
- The demo bar is now the only place that says the demo's content is made up. It must stay on
  every screen the demo account can open.
- Demo content has to read as real content, since nothing next to it says otherwise.
