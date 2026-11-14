# Hub phase controls on the hub page

## Context

The API now keeps a hub's phase. The owner confirms the team, which opens brainstorm, and then
moves the hub one phase forward or back (`POST /v1/hubs/{id}/team/confirm` and
`POST /v1/hubs/{id}/phase`). Until now the hub page printed four phase names that all read "Not
started". The tools for each phase do not exist yet.

## Decision

The web frontend's owner chose, on 14 November 2026:

- **Everyone who can see the hub page sees the four phases and their real state**, as a number,
  a name and a status pill, with the phase in progress marked for assistive technology. A line
  under the list says where things stand, for the owner, a member and an outsider.
- **Every change asks first.** Confirming the team and each move forward or back open the
  confirm dialog, which says in one sentence what will happen. Moving back says nothing is
  deleted.
- **Only the owner of an active hub gets buttons.** Members, outsiders and the owner of an
  archived hub only read.
- **The buttons are quiet ones.** The owner's invite form above already holds the page's one
  main button, so confirm, forward and back all use the secondary style.
- **No tool placeholders.** There are no tabs, empty panels or "coming soon" cards for a phase's
  tools. Each pull request that builds a tool adds its own place on the page.
- **The page shows the card the API answers with**, with no reload, and says what happened in a
  status line a screen reader hears.
- **When the hub changed elsewhere** (another tab or window: the team was already confirmed, the
  phase is not next to this one, or the team is not confirmed), the page loads the hub again and
  says: "This hub was changed somewhere else. This is where it is now." When the hub is archived
  or the person is no longer its owner, it loads the hub again and says the action is not
  available. Any other failure says nothing changed. The page writes these sentences itself and
  never shows the API's English message.

## Options we considered

- **Buttons without a dialog:** moving a hub changes what every member sees, and a stray press
  on a phone is easy. A dialog costs one tap.
- **Placeholder tabs for each phase's tools:** they would promise things that do not exist yet,
  and each would need rewriting when its tool arrives.
- **Leaving the page as it was after a refusal:** the buttons would then offer an action the hub
  no longer allows, so the page reads the hub again instead.

## Consequences

- There is no way to finish a hub: in review there is no next step. That comes with the API.
- The forward button is not the page's main button for as long as the invite form shows one
  above it. If the invite form changes, revisit this.
