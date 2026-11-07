# Village Sqwhere

**English** · [Français](README.fr.md)

**The village square for African developers.** Share an idea, get matched with developers who
want to build the same thing, and build it together in a shared space where your idea stays
protected.

> Built for **ACODev 2026**, the Africa Cup of Developers: *"Build the African exchange
> platform, for devs, by devs."*

**Live demo:** coming soon

---

## Why Village Sqwhere

Most developer platforms are built around hiring: profiles, job boards, recruiters. But many
good ideas never start because their author can't find the right people to build them with,
or worries that sharing the idea means losing it.

Village Sqwhere is about **building together**, not hiring. It brings developers with similar
ideas and complementary skills into the same room, and it protects every idea brought there.

## How it works

1. **Share an idea.** Describe what you want to build and what you bring to it.
2. **Get matched.** AI compares your idea with others on the platform and suggests developers
   with similar ideas and complementary skills.
3. **Agree to protect the idea.** Before anyone joins a hub, every member accepts a binding
   digital agreement (IP/NDA), so ideas can be shared safely.
4. **Build in a Virtual Collaboration Hub.** The matched team gets a shared space that moves
   from brainstorming, to design and architecture, to building, to peer review.

The platform is designed to work in **English and French** from the start.

## Tech stack

| Part | Technology |
| --- | --- |
| Web app | [Next.js](https://nextjs.org/) (App Router), TypeScript |
| API | Python, [FastAPI](https://fastapi.tiangolo.com/) |
| Database | PostgreSQL with [pgvector](https://github.com/pgvector/pgvector) for AI matching |
| Hosting | Systalink |

## Repository structure

```text
apps/
  web/        Next.js web app
  api/        FastAPI service
infra/        local database (Docker) and deployment notes
docs/         architecture, decisions and progress
.github/      CI workflow and pull request template
AGENTS.md     rules for the team and their coding agents
CHANGELOG.md  what changed, newest first
```

## Run it locally

You need [Node.js](https://nodejs.org/) 22 or newer (24 recommended),
[uv](https://docs.astral.sh/uv/) for Python, and [Docker](https://www.docker.com/) for the
database.

```bash
git clone https://github.com/AI-UNIPOD/Village-Sqwhere-ACODEV.git
cd Village-Sqwhere-ACODEV
corepack enable        # provides the pinned pnpm version
pnpm install
pnpm db:up             # Postgres + pgvector on localhost:5432
pnpm dev:api           # API on http://localhost:8000 (docs at /docs)
pnpm dev:web           # web app on http://localhost:3000 (in a second terminal)
```

Run `pnpm dev:api` and `pnpm dev:web` in separate terminals. `uv` installs the right Python
version and the API dependencies automatically the first time.

## Contributing

Team members: read [AGENTS.md](AGENTS.md) for the rules (your coding agent reads it too)
and [CONTRIBUTING.md](CONTRIBUTING.md) for setup and how a change reaches `main`.

## License

Not licensed yet: all rights reserved until the ACODev 2026 submission. We plan to release the
code under the MIT License after that.

## Acknowledgements

Built at the AI UniPod, University of Lagos, for ACODev 2026,
organised by Systalink.
