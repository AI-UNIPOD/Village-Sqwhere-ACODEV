# Green pull requests merge without a teammate's approval

## Context

GitHub Actions is off because of an account billing limit, so no check runs on pull requests.
Since #33 every pull request has landed on local checks, merged by hand, mostly with no review.
`main` cannot be protected on GitHub Free with a private repository. Tanny wanted pull requests
checked, merged when green, conflicts handled, and branches deleted, without someone watching.

## Decision

Tanny chose, on 13 November 2026:

- **A merge agent on Tanny's PC**, run every 5 minutes by Windows Task Scheduler. It is not in
  this repository: it reaches pull requests through Tanny's `gh` sign-in and its own clone, so a
  pull request cannot change the agent that checks it.
- **The same checks as `ci.yml`**, on each pull request merged with the latest `main`: the title
  rule, the dash check, web and API install, lint, test and build, a fresh database from
  `infra/db/init/`, and the gitleaks secret scan. Nothing merges unless every one passes.
- **A pull request's code runs only in Docker containers**, with none of Tanny's files, variables
  or sign-ins and a throwaway Postgres. Git hooks in a pull request never run on Tanny's PC.
- **Green pull requests merge without a teammate's approval.** This replaces the approval rule in
  `AGENTS.md` section 3. Reviews are still welcome; the `do-not-merge` label holds a pull request
  back. The agent squash merges with the pull request title and deletes the branch.
- **Failures and conflicts are flagged** with an `agent:` label and one comment (see
  `CONTRIBUTING.md`). Claude Haiku 5.5 explains a failed check in the comment. Claude Sonnet 5.5
  may resolve conflicts, but the result merges only after a person removes the
  `agent: review conflicts` label. Conflicts in `.github/`, `infra/` and `AGENTS.md` are always
  left to a person.
- **Vercel's checks are ignored.** Its previews are blocked for some contributors' commits,
  which says nothing about the code.

## Options we considered

- **A GitHub Actions workflow:** the natural home, but Actions is off.
- **Keeping the agent in this repository:** reviewed and tested like other code, but a green pull
  request that changed the agent would be merged by the agent itself, and nobody else runs it.
- **Requiring a teammate's approval before the agent merges:** matches the old rule, but in
  practice almost nothing was reviewed, so the agent would rarely merge anything.
- **Rebasing branches onto `main`:** needs force-pushes, which `AGENTS.md` forbids on shared
  branches.

## Consequences

- Green pull requests reach `main` within minutes, as one squash commit each.
- Merges, comments and pushes appear under Tanny's GitHub account, and only while Tanny's PC is
  on with Docker Desktop running.
- A failure caused by the PC (no network, for example) is reported like a real one. Removing the
  label retries.
- Revisit when GitHub Actions is back: move the checks to CI, or use GitHub's own auto-merge once
  `main` can be protected.
