<!--
PR title: a one-line conventional commit, e.g. "feat(api): add idea embedding endpoint".
We squash merge, so the title becomes the commit on main. See CONTRIBUTING.md.
-->

## What and why

<!-- What does this change do, and why is it needed? Link the issue or task if there is one. -->

## How to test

<!-- Steps a reviewer can follow to check it works. Add screenshots for UI changes. -->

## Checklist

- [ ] PR title is a one-line conventional commit (no body, no trailers)
- [ ] `pnpm lint:web` and `pnpm build:web` pass (if `apps/web` changed)
- [ ] `pnpm lint:api` and `pnpm test:api` pass (if `apps/api` changed)
- [ ] Docs updated: README **and** README.fr.md, CONTRIBUTING, `docs/` or app READMEs, as needed
- [ ] New settings added to `.env.example`, and no secrets committed
- [ ] User-facing text works in both English and French (if the UI changed)
