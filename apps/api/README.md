# apps/api

The Village Sqwhere API: Python and FastAPI, managed with [uv](https://docs.astral.sh/uv/).

From the repository root:

```bash
pnpm db:up        # Postgres + pgvector (see infra/)
pnpm dev:api      # http://localhost:8000, docs at /docs
pnpm test:api
pnpm lint:api
```

Or from this folder: `uv sync`, then `uv run fastapi dev app/main.py`.

Settings come from environment variables or a root `.env` file (see the root `.env.example`).
`JWT_SECRET_KEY` is required: the API will not start without it. GitHub sign-in also needs
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
Code lives in `app/`, tests in `tests/`.

Tests need `TEST_DATABASE_URL`: the address of a separate database, `village_sqwhere_test`, so
they never touch your development data. Without it they stop at start-up and say so. Create it
once, from the repository root, with the database running (`pnpm db:up`):

```bash
docker compose -f infra/docker-compose.yml exec db psql -U village -d postgres -c "CREATE DATABASE village_sqwhere_test OWNER village;"
docker compose -f infra/docker-compose.yml exec db sh -c 'for f in /docker-entrypoint-initdb.d/*.sql; do psql -v ON_ERROR_STOP=1 -U village -d village_sqwhere_test -f "$f" || exit 1; done'
```

Then set `TEST_DATABASE_URL` in your root `.env` (the value is in `.env.example`). The second
command applies every script in `infra/db/init/`. When a new script lands there, drop the test
database (`DROP DATABASE village_sqwhere_test;`) and run both commands again. CI uses its own
database and needs no setting.

## The demo

"Try the demo" signs visitors in to a shared, read-only account
(`docs/decisions/2026-11-13-read-only-demo.md`). Where the demo should be on, set
`DEMO_ENABLED=true` and fill the database with made-up content, from the repository root:

```bash
uv run --directory apps/api python -m app.demo_seed
```

It writes to `DATABASE_URL`, and only when `DEMO_ENABLED=true` is set in the same environment:
otherwise it stops with an error and writes nothing, so running it by mistake against a server
without the demo leaves that server alone. Everything it makes is demo content, which real
developers never see. Its times count back from when it runs, so the feed reads "2 hours ago". Run it again, for
example on the morning of a demo, to rewrite the posts and comments with fresh times; the
people, ideas and hubs stay as they are, each person gets their bio and country again, the
roles, technologies, sectors, people and open ideas that are missing are added, and the
visitor's own hub is put in the build phase if it has none yet, gets its six brainstorm notes
if it has no notes, and gets a design sketch of five pieces and six links if it has no pieces.
The visitor's own idea shows a Strong, a Possible and a Weak match, and "For you" holds two
open ideas with different scores.
