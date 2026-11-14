# A country on the profile, no city

## Context

Nothing on a profile says where a developer is, while the landing page's match cards show a
place for each person. Onboarding already asks for a country and has nowhere to save it. A
place is also personal data, and the more exact it is, the more it says about a person.

## Decision

A developer can name a country, and nothing finer. Tanny decided this on 2026-11-14.

- The country is optional. A developer who leaves it empty loses nothing.
- It is one of the 54 African countries, stored as a two-letter ISO 3166-1 code (`users.country_code`,
  for example `NG`). The API checks the code against the list in `apps/api/app/countries.py`; the
  table only checks the shape (two capital letters), so adding a country is a code change and not
  a database script.
- `PATCH /v1/me` sets it with a code and clears it with `null`. Leaving it out changes nothing.
- It will be shown to other signed-in developers on match cards, in a later pull request. That is
  why the web form must say so next to the field.

## Options we considered

Tanny was offered three and chose the country alone.

- A free-text city next to the country. It covers every town with no list to keep, but people
  spell the same city many ways, and a city says more about a person than a country does.
- A list of cities for each country. The spelling stays the same, but the list has to be written
  and kept up to date, and smaller towns would be missing.

## Consequences

A developer's country can be seen by other signed-in developers once match cards show it, so the
form has to say that before they save. Developers outside Africa cannot name their country for
now. Revisit if the platform opens beyond Africa or if country alone is not enough for matching.
