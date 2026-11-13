# A hub takes at most five active members

## Context

The web app already tells people a hub is full at five members (`TEAM_MAX` in
`apps/web/app/hubs/team.tsx`) and stops offering invitations, but the API had no limit. Anyone
calling the API directly, or two people accepting at the same moment, could grow a team past
what every screen promises. A rule the screens state has to hold in the API too.

## Decision

Tanny chose, on 13 November 2026, a cap of **five active members per hub, the owner
included**, enforced by the API (`MAX_ACTIVE_MEMBERS` in `apps/api/app/api/v1/hub_members.py`):

- Inviting into a hub that already has five active members answers `409 TEAM_FULL`.
- Accepting an invitation answers `409 TEAM_FULL` when the team filled up after it was sent.
  The invitation stays pending and nothing is signed, so the owner can make room or withdraw
  it.
- Pending invitations do not count: an owner may invite more people than there are places,
  and the first to accept join.
- Both checks run while the hub row is locked, the way every membership change already does,
  so two people cannot both take the last place.

## Options we considered

- **No limit in the API, only in the web app:** the screens could be bypassed, and the hub
  team would no longer match what the product shows.
- **Counting pending invitations against the cap:** stops owners from asking more people than
  there are places, so a team stays short whenever someone declines.
- **A limit stored per hub:** no screen or product rule needs a different size yet. One
  number in one place is enough until one does.

## Consequences

- The web app and the API agree: a full team cannot grow, whoever calls the API.
- Changing the size means changing `MAX_ACTIVE_MEMBERS` and `TEAM_MAX` together.
- Removing members is not built yet, so a full team stays full until that route exists.
