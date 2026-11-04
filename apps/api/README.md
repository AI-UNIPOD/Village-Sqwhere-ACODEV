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

Settings come from environment variables (see the root `.env.example`): `DATABASE_URL` and `CORS_ORIGINS`.
Code lives in `app/`, tests in `tests/`.
