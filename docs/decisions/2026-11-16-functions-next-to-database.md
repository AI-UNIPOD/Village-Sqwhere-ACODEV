# Run the Vercel functions next to the database

## Context

On 16 Nov the live pages took 4 to 21 seconds to fill. The page shells came from the Paris edge
in under a second; the time went on the API. The functions ran in `iad1` (Washington, the
Vercel default) and the Neon database is in Frankfurt (`eu-central-1`). Every query crossed the
Atlantic, about 0.1 to 0.25 seconds each, and opening the connection cost about 0.85 seconds.
`GET /v1/me` makes 10 queries (4 seconds) and `GET /v1/me/hubs` made 141 (19 seconds). The
same requests take about 0.2 seconds against a local database.

SQL echo was also on in production, so every statement and its values went to the function
logs, which also put user data in them.

## Decision

`vercel.json` sets `"regions": ["fra1"]`, so the functions run in Frankfurt next to Neon. The
worker daemon stays in `cdg1` (Paris), which is close to Frankfurt too. SQL echo stays on
locally and is off on Vercel (`apps/api/app/database.py`).

## Options we considered

- Moving the database to `us-east-1` instead. That means a migration and data copy, and
  Frankfurt is closer to the people using the app in Africa and Europe.
- Only cutting the number of queries. Worth doing too, but every query would still cross the
  Atlantic.

## Consequences

- Each query is a short hop inside Frankfurt, so a page's API calls take a small part of what
  they did.
- If the database ever moves, `regions` must move with it.
