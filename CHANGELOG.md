# Changelog

What changed in Village Sqwhere, newest first. Every pull request that changes behaviour,
setup or docs adds one line under the date it merges, in the same words as its title, with
its number:

```text
- feat(api): add idea embedding endpoint (#12)
```

## 2026-11-07

- ci: run api tests against postgres with pgvector (#5)
- feat(api): connected db and lookups endpoints (#2)

## 2026-11-04

- chore(repo): add agent rules, commit hook, ci and team workflow (#1)
- Set up the monorepo before pull requests were in place (pushed directly to `main`): the
  Next.js web app, the FastAPI service, the local Postgres and pgvector database, the
  README in English and French, and the contributing guide.
- Initial commit with a `.gitignore`.
