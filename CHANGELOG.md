# Changelog

What changed in Village Sqwhere, newest first. Every pull request that changes behaviour,
setup or docs adds one line under the date it merges, in the same words as its title, with
its number:

```text
- feat(api): add idea embedding endpoint (#12)
```

## 2026-11-11

- fix(web): keep the brand name and language code out of translation (#27)
- fix(web): show the real name and link the github username on the card (#23)
- feat(web): add the onboarding page for after the first sign-in (#22)
- feat(web): add the github sign-in page (#21)
- docs: add the verification routes to the architecture doc (#14)
- fix(api): return the real attempt number when a verification starts (#19)
- docs: add the api endpoints to progress and architecture (#13)
- fix(web): seat the demo note under its button in a clear space (#12)
- feat(web): add scroll reveals and feedback to the landing sections (#11)
- feat(api): add verification and peer review endpoints (#10)

## 2026-11-10

- feat(web): drift the hero background words from right to left (#9)
- feat(web): add the landing page in English and French (#8)
- feat(api): add developer roles, tech stack and feed topics (#7)

## 2026-11-07

- feat(api): add oauth authentication and user profile endpoints (#3)
- feat: add design system and use it in the web app (#6)
- ci: run api tests against postgres with pgvector (#5)
- feat(api): connected db and lookups endpoints (#2)

## 2026-11-04

- chore(repo): add agent rules, commit hook, ci and team workflow (#1)
- Set up the monorepo before pull requests were in place (pushed directly to `main`): the
  Next.js web app, the FastAPI service, the local Postgres and pgvector database, the
  README in English and French, and the contributing guide.
- Initial commit with a `.gitignore`.
