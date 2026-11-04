# Contributing to Village Sqwhere

This guide is for the team. It covers setup, how we branch, how we write commits, and how
changes reach `main`. The [README](README.md) is the public face of the project; keep
team-only detail here.

## Setup

Prerequisites:

- Node.js 22+ (24 recommended, see `.nvmrc`)
- [uv](https://docs.astral.sh/uv/) (it installs Python 3.13 for you)
- Docker Desktop (for the local database)

```bash
git clone https://github.com/AI-UNIPOD/Village-Sqwhere-ACODEV.git
cd Village-Sqwhere-ACODEV
corepack enable              # once per machine; provides pnpm at the version in package.json
pnpm install                 # web dependencies
uv sync --directory apps/api # API dependencies (pnpm dev:api also does this)
pnpm db:up                   # Postgres + pgvector
```

Settings live in `.env.example`. The defaults work for local development; copy values into
`apps/web/.env.local` or your shell environment only when you need to change them. Never
commit real secrets.

### Everyday commands (run from the repo root)

| Command | What it does |
| --- | --- |
| `pnpm dev:web` | Web app on http://localhost:3000 |
| `pnpm dev:api` | API on http://localhost:8000 (interactive docs at `/docs`) |
| `pnpm lint:web` / `pnpm build:web` | Lint / production-build the web app |
| `pnpm lint:api` / `pnpm test:api` | Lint / test the API |
| `pnpm db:up` / `pnpm db:down` | Start / stop the local database |

## Branching: GitHub Flow

- `main` is always working and deployable. Don't commit to it directly; open a pull request.
- Create a short-lived branch from the latest `main` for each piece of work:

  ```bash
  git switch main && git pull
  git switch -c feat/idea-matching
  ```

- Name branches `<type>/<short-description>` in lowercase with hyphens, using the commit types
  below: `feat/hub-chat`, `fix/login-redirect`, `docs/api-setup`, `chore/update-deps`.
- Keep branches small and merge them within a day or two. Rebase on or merge `main` if it moves.
- Delete the branch after it is merged.

## Commit messages

Every commit message is **one line** in [Conventional Commits](https://www.conventionalcommits.org/)
format, with **no body and no trailers** (no `Co-authored-by:`, `Signed-off-by:` or similar).

```text
<type>(<optional scope>): <summary in lowercase, imperative, no full stop>
```

Examples:

```text
feat(api): add idea embedding endpoint
fix(web): keep language choice after reload
docs: explain how to reset the local database
```

Types: `feat` (new feature), `fix` (bug fix), `docs` (documentation only), `style`
(formatting), `refactor` (no behaviour change), `perf`, `test`, `build` (dependencies, build
setup), `ci`, `chore` (maintenance).

Scopes: `web`, `api`, `infra`, `docs`, or leave the scope out when a change spans several.

## Pull requests

1. Push your branch and open a pull request into `main`. The template will guide you.
2. **The PR title is a one-line conventional commit** (same rules as above), because we
   **squash merge**: the PR title becomes the single commit on `main`.
3. Before asking for review: `pnpm lint:web`, `pnpm build:web`, `pnpm lint:api` and
   `pnpm test:api` pass.
4. Get at least one teammate's review, then squash merge.

## Document as you go

Every change ships with its documentation in the same pull request:

- New setup steps, commands or environment variables go in this file and `.env.example`.
- Changes to what the product does or how to run it go in `README.md` **and** `README.fr.md`.
  Keep the two in step.
- Design changes go in `docs/architecture.md`.
- App-specific notes go in `apps/web/README.md` or `apps/api/README.md`.

## Languages

The product is bilingual (English and French). The public README exists in both languages;
team docs such as this one are in English.
