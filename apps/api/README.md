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
