# Contributing to Village Sqwhere

This guide is for the team: setup, everyday commands, and how a change gets from your
computer to `main`, with the commit rule and what to document. The [README](README.md) is
the public face of the project.

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
commit rule ([Commit messages](#commit-messages)). If a commit is rejected, the message
tells you why.

Settings live in `.env.example`. The defaults work for local development, with one
exception: the API needs `JWT_SECRET_KEY`. Copy `.env.example` to `.env` at the repo root and
set it (the file says how to make one). To sign in locally, also add your own GitHub OAuth
app's client ID and secret there. Tests need neither. Never commit real secrets.

The API tests write to a separate database, `village_sqwhere_test`, so they never touch your
development data. Create it once with the commands in [`apps/api/README.md`](apps/api/README.md),
then set `TEST_DATABASE_URL` in your `.env` (the value is in `.env.example`). Without it,
`pnpm test:api` stops at start-up and says what is missing. CI uses its own database and needs
no setting.

### Everyday commands (run from the repo root)

| Command | What it does |
| --- | --- |
| `pnpm dev:web` | Web app on http://localhost:3000 |
| `pnpm dev:api` | API on http://localhost:8000 (interactive docs at `/docs`) |
| `pnpm lint:web` / `pnpm test:web` / `pnpm build:web` | Lint / test / production-build the web app |
| `pnpm lint:api` / `pnpm test:api` | Lint and format-check / test the API (tests need `pnpm db:up` and the test database described above) |
| `pnpm db:up` / `pnpm db:down` | Start / stop the local database |

For tests that re-run as you save, use `pnpm --filter web exec vitest` (web) or
`uv run --directory apps/api pytest -x` (API).

## Commit messages

Every commit message is exactly one line: `<type>(<scope>): <what was done>`.

- **Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `style`,
  `chore`, `revert`. **Scopes** (optional): `web`, `api`, `infra`, `docs`, `ci`, `repo`.
- Lowercase type and scope. The description starts with a lowercase verb in the present
  tense ("add", "fix", "remove"), has no full stop and keeps the line to 72 characters.
- No body, no trailers of any kind, no emoji, no em dashes or en dashes.

```text
Good: feat(api): add idea embedding endpoint
Bad:  Added new feature.
```

The `commit-msg` hook in `.githooks/` checks every commit, and the merge agent checks pull
request titles the same way, because the title becomes the commit on `main`.

## How a change gets to `main`

1. **Start from the latest `main`** and make a branch named `<type>/<short-description>`:

   ```bash
   git switch main && git pull
   git switch -c feat/idea-matching
   ```

2. **Build in small steps.** Commit as you go; every message is one line in the
   conventional format, for example `feat(web): add the idea form`.
3. **Document it in the same branch:** one line in `CHANGELOG.md` under today's date with
   the pull request number, a decision record in `docs/decisions/` if you made a choice
   someone might question, and any README or doc your change makes wrong (`README.md` and
   `README.fr.md` stay in step).
4. **Run the checks** and fix what fails:

   ```bash
   pnpm lint:web && pnpm test:web && pnpm build:web
   pnpm lint:api && pnpm test:api
   ```

5. **Push and open a pull request** into `main`. The title is a one-line conventional
   commit, because we squash merge and the title becomes the commit on `main`. Fill in the
   template.
6. **The merge agent takes it from there** (below): within a few minutes it runs the checks,
   squash merges the pull request if they all pass and deletes the branch. To hold it back,
   for example for a review, add the `do-not-merge` label.
7. **If it flags the pull request, fix it on the branch.** It runs the checks again on the
   next push. Answer every review comment the same way.

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

### The merge agent

GitHub Actions is off for now (billing limit), so the checks above run on Tanny's PC instead.
Tanny's merge agent, which lives on that PC and not in this repository, checks every open pull
request into `main` every 5 minutes, merged with the latest `main`. Then:

| You see | It means | You do |
| --- | --- | --- |
| The pull request merged and the branch gone | Every check passed | Nothing |
| `agent: checks failed` and a comment | A check failed; the comment says which and why | Fix it and push |
| `agent: conflicts` and a comment | Conflicts it would not or could not resolve | Merge `main` in, resolve, push |
| `agent: review conflicts` and a comment | It resolved conflicts and the checks passed | Read the resolution, then remove the label |

Removing an `agent:` label makes it try the same commit again. Why it works this way:
[`docs/decisions/2026-11-13-merge-agent.md`](docs/decisions/2026-11-13-merge-agent.md). Questions
about it go to Tanny.

There is no automatic deployment yet. A deploy job will be added once the team has access
to the Systalink platform (see `infra/README.md`).

## Languages

The product is bilingual (English and French). The public README exists in both languages
and the two must stay in step; team docs such as this one are in English.
