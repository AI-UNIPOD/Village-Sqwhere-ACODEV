# Changelog

What changed in Village Sqwhere, newest first. Every pull request that changes behaviour,
setup or docs adds one line under the date it merges, in the same words as its title, with
its number:

```text
- feat(api): add idea embedding endpoint (#12)
```

## 2026-11-11

- fix(web): keep the french phone nav links on one line (#35)
- test(api): isolate the test database from the development one (#29)
- feat(db): add hub terms and a test agreement (#33)
- feat(web): add the auth callback page that finishes github sign-in (#32)
- fix(web): give the onboarding page a title in english and french (#31)
- fix(web): show hover styles only on devices that can hover (#28)
- fix(web): keep the brand name and language code out of translation (#27)
- fix(web): say sign-in did not start when the browser cannot hash (#26)
- fix(web): use the design system breakpoint for the sign-in button (#25)
- fix(api): never block sign-in on a clashing email (#24)
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
