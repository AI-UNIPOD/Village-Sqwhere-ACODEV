# Contributing to Village Sqwhere

This guide is for the team: setup, everyday commands, and how a change gets from your
computer to `main`. The rules themselves (code quality, commits, review, docs, security,
and what coding agents may and may not do) are in [AGENTS.md](AGENTS.md). Read it first;
your coding agent reads it too. The [README](README.md) is the public face of the project.

## Setup

Prerequisites:

- Node.js 22+ (24 recommended, see `.nvmrc`)
- [uv](https://docs.astral.sh/uv/) (it installs Python 3.13 for you)
- Docker Desktop (for the local database)

```bash
git clone https://github.com/AI-UNIPOD/Village-Sqwhere-ACODEV.git
cd Village-Sqwhere-ACODEV
corepack enable              # once per machine; provides pnpm at the version in package.json
pnpm install                 # web dependencies, and turns on the commit message hook
uv sync --directory apps/api # API dependencies (pnpm dev:api also does this)
pnpm db:up                   # Postgres + pgvector
```

`pnpm install` sets `core.hooksPath` to `.githooks`, so every commit is checked against the
commit rule (AGENTS.md section 2). If a commit is rejected, the message tells you why.

Settings live in `.env.example`. The defaults work for local development, with one
exception: the API needs `JWT_SECRET_KEY`. Copy `.env.example` to `.env` at the repo root and
set it (the file says how to make one). To sign in locally, also add your own GitHub OAuth
app's client ID and secret there. Tests need neither. Never commit real secrets.

### Everyday commands (run from the repo root)

| Command | What it does |
| --- | --- |
| `pnpm dev:web` | Web app on http://localhost:3000 |
| `pnpm dev:api` | API on http://localhost:8000 (interactive docs at `/docs`) |
| `pnpm lint:web` / `pnpm test:web` / `pnpm build:web` | Lint / test / production-build the web app |
| `pnpm lint:api` / `pnpm test:api` | Lint and format-check / test the API (tests that use the database need `pnpm db:up` first) |
| `pnpm db:up` / `pnpm db:down` | Start / stop the local database |

For tests that re-run as you save, use `pnpm --filter web exec vitest` (web) or
`uv run --directory apps/api pytest -x` (API).

## How a change gets to `main`

1. **Start from the latest `main`** and make a branch named `<type>/<short-description>`:

   ```bash
   git switch main && git pull
   git switch -c feat/idea-matching
   ```

2. **Build in small steps.** Commit as you go; every message is one line in the
   conventional format, for example `feat(web): add the idea form`.
3. **Document it in the same branch:** a line in `CHANGELOG.md`, a decision record if you
   made a choice someone might question, and any README or doc your change makes wrong
   (AGENTS.md section 4).
4. **Run the checks** and fix what fails:

   ```bash
   pnpm lint:web && pnpm test:web && pnpm build:web
   pnpm lint:api && pnpm test:api
   ```

5. **Push and open a pull request** into `main`. The title is a one-line conventional
   commit, because we squash merge and the title becomes the commit on `main`. Fill in the
   template.
6. **Wait for CI to go green** (below), then ask a teammate to review.
7. **Answer every review comment.** Push fixes to the same branch.
8. **Squash merge** once CI is green and a teammate has approved, then delete the branch.

If `main` moves while you work, merge it into your branch (`git merge main`). Do not start a
branch from another unmerged branch.

## What CI checks

GitHub Actions runs `.github/workflows/ci.yml` on every pull request and on every push to
`main`. Each check shows as a line on the pull request:

| Check | What it does |
| --- | --- |
| `pr-title` | The title follows the one-line commit rule |
| `dash-check` | No em dashes or en dashes in the files you changed |
| `web` | Installs from the lockfile, then lints, tests and builds the web app |
| `api` | Starts Postgres with pgvector, applies `infra/db/init/`, then installs from the lockfile, lints, format-checks and tests the API |
| `secret-scan` | gitleaks looks through the whole history for keys and passwords |

If a check fails, click it to read the log, fix the problem on your branch and push again.
CI re-runs on its own.

There is no automatic deployment yet. A deploy job will be added once the team has access
to the Systalink platform (see `infra/README.md`).

## Languages

The product is bilingual (English and French). The public README exists in both languages
and the two must stay in step; team docs such as this one are in English.
