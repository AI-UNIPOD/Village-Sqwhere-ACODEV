# Deploying on Vercel

## Context

The app has three parts that must run in production: the Next.js web app, the FastAPI API and
the verification worker, which runs all the time outside any request. The plan was to host on
Systalink, but the team has no platform access and the submission is due. The AI UniPod has a
Vercel team, and Vercel can now run several services and a long-running worker in one project.

## Decision

Deploy on the AI UniPod's Vercel team, as one project described by `vercel.json` at the
repository root:

- service `web`: `apps/web`, served at every path not listed below;
- service `api`: `apps/api`, `app.main:app`, served at `/v1/*`, `/health`, `/docs` and
  `/openapi.json`;
- daemon `worker`: `apps/api/Dockerfile.worker`, one instance in `cdg1` (Paris).

The web app and the API share one domain, so the browser calls the API on the same origin.
The domain is registered at Namecheap and pointed at Vercel. CJ chose this on 2026-11-15.

## Options we considered

- Systalink: the plan, but no access yet.
- Two Vercel projects, one per app: two domains, CORS between them, and the worker still
  needing a host.
- A single server running Docker Compose: one more machine to keep up for the team.

## Consequences

- Sign-in state lives in API memory (`2026-11-07-sign-in-without-dev-login.md`), and Vercel can
  run several API instances, so GitHub sign-in can fail until that state moves to the database.
- The interview's WebSocket runs inside a function, so a function's maximum duration caps an
  interview.
- The database is hosted outside the repository (Neon, for example) and its schema is applied
  once from `infra/db/init/`. New init scripts must be run against it by hand.
- **The demo on the live site needs four steps, by someone who holds the database address.**
  Set `DEMO_ENABLED=true` as a project variable so the API and the `worker` daemon both see it:
  the API offers "Try the demo" with it, and the worker, with it, dates the demo's feed back from
  now once a day (`2026-11-15-lived-in-demo.md`). Apply every script in `infra/db/init/` up to the
  newest to the live database. Run `python -m app.demo_seed` once against it with the same
  variable: the worker only refreshes a demo that exists and never makes one. Then redeploy from
  `main`, because a changed variable only reaches a new deployment.
- If ACODev requires Systalink, the same Dockerfile and settings carry over.
