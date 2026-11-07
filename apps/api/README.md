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
