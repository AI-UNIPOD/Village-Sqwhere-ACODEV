# Another developer's profile

## Context

No route showed one developer to another outside a match card or a team list
(`2026-11-13-profile-page.md`: "no route shows someone else"), so the web could not link a name
to a profile. Tracker row 15 asks for `GET /v1/users/{username}`. Tanny chose what it shows on
2026-11-14.

## Decision

Any signed-in developer can read another's profile: username, display name, avatar, bio,
country, the verified flag, verified roles, technologies and sectors. That is the match card's
fields plus the bio and sectors. It never shows the email, first or last name, sign-in
accounts, roles claimed but not verified, verification attempts or feed topics.

Deleted accounts answer `404`, and the demo rule holds: made-up demo developers are seen only
from the demo, and real developers never from it.

## Options we considered

- Match-card fields only, without bio or sectors. Not chosen by Tanny: the bio is what a person
  writes for others to read.
- Keep profiles private. Not chosen: names on cards and team lists had nowhere to lead.

## Consequences

The country is shown to every signed-in developer, as the profile country record already
planned. A "pause matching" setting (build plan F5) would not hide the profile; revisit if that
setting ships.
