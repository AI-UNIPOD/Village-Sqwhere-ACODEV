# Architecture

A short overview of how Village Sqwhere fits together. Update it when the design changes.

## Components

```text
Browser ──► apps/web (Next.js) ──► apps/api (FastAPI) ──► PostgreSQL + pgvector
```

- **apps/web**: the user interface, in English and French. It talks to the API over HTTP
  (`NEXT_PUBLIC_API_URL`).
- **apps/api**: business logic: profiles, ideas, matching, agreements and hubs. Settings come
  from environment variables (`DATABASE_URL`, `CORS_ORIGINS`).
- **PostgreSQL + pgvector**: the main data store. pgvector stores embeddings of ideas and
  skills so the API can find similar ideas and complementary collaborators.
- **Hosting**: everything is deployed on Systalink (see `infra/README.md`).

## Core flow

1. A developer signs in and shares an idea.
2. The API embeds the idea and finds developers with similar ideas and complementary skills.
3. Matched developers accept the digital IP/NDA agreement before joining.
4. The API provisions a Virtual Collaboration Hub that moves through four phases:
   brainstorm → design and architecture → build → peer review.

## Decisions so far

- Monorepo with one folder per app (`apps/web`, `apps/api`), shared tooling at the root.
- pnpm workspace for JavaScript, uv for Python, Docker Compose for local services.
- GitHub Flow with squash merges (see `AGENTS.md` and `CONTRIBUTING.md`).

Each decision someone might question gets a record in `docs/decisions/`.
