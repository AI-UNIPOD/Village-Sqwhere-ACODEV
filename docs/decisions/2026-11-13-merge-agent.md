# A merge agent that tests and merges pull requests

## Context

GitHub Actions is off because of an account billing limit, so no check runs on pull requests.
Since #33 every pull request has landed on local checks, merged by hand, mostly with no review.
`main` cannot be protected on GitHub Free with a private repository. Tanny wanted pull requests
checked, merged when green, conflicts handled, and branches deleted, without someone watching.

## Decision

Tanny chose, on 13 November 2026, a merge agent in `scripts/merge-agent/`:

- **It runs on Tanny's Windows machine** from Task Scheduler every 5 minutes, in its own clone
  under `%LOCALAPPDATA%`, so it never touches anyone's working copy. It needs no GitHub Actions
  minutes, secrets or tokens beyond the `gh` and Claude Code sign-ins already on that machine.
- **It runs the same checks as `ci.yml`**, on each pull request merged with the latest `main`.
  It makes its own test database from `infra/db/init/`, as CI does, so it reads no `.env` file.
  Without gitleaks it stops, so no pull request merges without the secret scan.
- **It merges on green checks alone.** This replaces the rule that a teammate must approve
  first (`AGENTS.md` section 3). Reviews are still welcome. A `do-not-merge` label holds a pull
  request back.
- **A plain script makes every merge and delete decision.** The decisions are fixed rules
  (checks passed, branch and `main` unchanged, branch not protected or in use), so a model adds
  cost and risk without adding judgement. The pull request's own text cannot talk a script into
  merging.
- **Models only where judgement helps.** Claude Haiku 5.5 turns the end of a failed log into two
  or three plain sentences. Claude Sonnet 5.5 resolves merge conflicts, with file tools only
  inside the clone and a budget of 40 turns and 3 US dollars. No subagents: one pull request at a
  time also stops two merges from racing.
- **A person reviews every automatic conflict resolution.** The agent pushes the resolution as a
  normal merge commit (never a force-push), labels the pull request `agent: review conflicts`
  and merges only after someone removes the label. Conflicts in `.github/`, `infra/`,
  `AGENTS.md` or the agent itself are never resolved automatically.
- **Vercel's checks are ignored.** Its previews are blocked for some contributors' commits,
  which says nothing about the code.

## Options we considered

- **A GitHub Actions workflow:** the natural home, but Actions is off. It would also need a
  personal access token, because pushes made with the job's own token do not start CI.
- **Claude Haiku running the routine steps as an agent:** costs tokens on every run and lets text
  in a pull request influence a merge. A script does the same steps for free.
- **Requiring a teammate's approval before the agent merges:** matches the old rule, but in
  practice almost nothing was reviewed, so the agent would rarely merge anything.
- **Requiring Vercel's checks:** would block pull requests for reasons unrelated to the code.
- **Rebasing branches onto `main`:** needs force-pushes, which `AGENTS.md` forbids on shared
  branches.

## Consequences

- Green pull requests reach `main` within minutes, as one squash commit each, and their branches
  are deleted.
- It runs each pull request's code (install scripts, tests, build) unsandboxed on Tanny's
  machine, as Tanny, next to Tanny's GitHub admin and Claude sign-ins. Anyone with push access,
  or a bad dependency in a pull request, can run code there. We accept this because only the
  team can push branches and pull requests from forks are skipped. A disposable machine or a
  container would remove it, at the cost of more setup.
- It works only while Tanny's machine is on, signed in, and has the database running. Merges,
  comments and pushes appear under Tanny's GitHub account.
- A failure caused by the machine (no network, for example) is reported like a real one. Removing
  the label retries.
- Revisit when GitHub Actions is back: move the checks back to CI and keep the agent for merging
  and conflicts, or replace it with GitHub's own auto-merge once `main` can be protected.
