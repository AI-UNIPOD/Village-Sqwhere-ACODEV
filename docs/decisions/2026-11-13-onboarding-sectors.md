# Sectors a developer wants to build for

Name: `2026-11-13-onboarding-sectors.md`

## Context

Onboarding asks which areas a developer wants to build for: fintech, health, education and so
on. The API had nowhere to keep that answer. Feed topics are technologies, and
`2026-11-11-onboarding-page.md` left open (gap 3) whether onboarding asks for sectors or
technologies. The ten sectors have been on the onboarding screen since it shipped, kept only
in the browser tab.

## Decision

Tanny decided on 13 November 2026 that onboarding asks for both: technologies for the feed
(`PUT /v1/me/feed-topics`, already on `main`) and sectors. The session that owns the feed and
posts API built the sectors part, in a shape agreed with the web session:

1. A `sectors` lookup table, like `roles` and `technologies`, seeded with the ten onboarding
   slugs in their order: `fintech`, `agritech`, `health`, `education`, `climate-energy`,
   `mobility-logistics`, `commerce`, `civic`, `media-culture`, `developer-tools`. A
   `user_sectors` table holds each developer's set. Both are in `infra/db/init/010-sectors.sql`.
2. `GET /v1/sectors` lists the active sectors with English names. The web app keeps the French
   names by slug, as it does for roles and technologies.
3. `PUT /v1/me/sectors` replaces the whole set and is safe to send again, like the stack and
   feed topics. `[]` clears it. `GET /v1/me` returns `sectors`.
4. Sectors are only stored for now. The feed, matching, posts and ideas do not use them.

## Options we considered

- **Keep sectors in code, not a table:** rejected. A table lets the team add a sector without a
  web release: the web app falls back to the API's `name` for a slug it does not know.
- **Use sectors as the feed's topics:** rejected. Posts are tagged with technologies, so a
  sector feed would match nothing until posts get sectors too.
- **One onboarding save for every answer (gap 6):** not now. The web app already saves the role
  and the stack as separate requests that are safe to resend, and sectors fit the same way.

## Consequences

- Onboarding can save all its answers except the country and a completion flag (gaps 1 and 2).
- A database made before `010-sectors.sql` needs the script run once by hand; it is safe to run
  twice.
- If ideas or posts get sectors later, the feed or matching can use this table.
