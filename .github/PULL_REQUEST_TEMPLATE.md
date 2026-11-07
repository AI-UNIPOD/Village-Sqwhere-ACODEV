<!--
Title: one line, conventional commit, for example "feat(api): add idea embedding endpoint".
We squash merge, so the title becomes the commit on main. Rules: AGENTS.md.
-->

## What was done

<!-- Two to five plain sentences. -->

## Why

<!-- The problem this solves or the task it comes from. -->

## How to test

<!-- Exact steps or commands a reviewer can follow. Screenshots for UI changes. -->

## Checklist

- [ ] One feature or fix, branched from the latest `main`
- [ ] Title is a one-line conventional commit (no body, no trailers)
- [ ] Tests added or updated for every change in behaviour
- [ ] Checks pass locally: `pnpm lint:web`, `pnpm test:web`, `pnpm build:web`, `pnpm lint:api`, `pnpm test:api`
- [ ] UI changes work in English and French, on a phone, with loading and error states
- [ ] A line added to `CHANGELOG.md` (or this is a tiny chore)
- [ ] Docs updated where this makes them wrong: `README.md` and `README.fr.md`, app READMEs, `docs/`, `.env.example`
- [ ] A decision record in `docs/decisions/` if this makes a choice someone might question
- [ ] No secrets, real user data or AI attribution in the diff
