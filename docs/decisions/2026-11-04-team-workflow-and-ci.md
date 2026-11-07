# Team workflow, agent rules and CI

## Context

Most of the team builds alongside a coding agent (Claude Code, Codex, Cursor, Copilot and
others). Without shared rules, each agent writes code, commits and pull requests in its own
way. Tanny's previous project, Project Sam, had a working setup and three lessons:

- With branch protection off, commits reached `main` without a pull request, so CI never
  ran on them.
- Stacked pull requests conflicted with `main`, never ran full CI and were too large to
  review.
- Numbered decision records clashed when two branches picked the same number, and the
  progress file grew past 1,500 lines, too long for an agent to read every session.

## Decision

Tanny chose, on 4 November 2026:

- **One rulebook, `AGENTS.md`**, for people and agents. Most agents read it directly.
  `CLAUDE.md` only imports it for Claude Code.
- **One-line conventional commits, no body, no trailers**, checked by `.githooks/commit-msg`
  (turned on by `pnpm install`) and by CI on pull request titles.
- **GitHub Flow**: short branches from `main`, one feature or fix per pull request, no
  stacking, one approval, squash merge.
- **`CHANGELOG.md`** as the record of changes, one line per pull request, instead of a log
  file per pull request. Decision records are named by date. `docs/PROGRESS.md` stays
  under 60 lines.
- **One CI workflow** in which every job runs on every pull request: title, dash check,
  web (lint, test, build), api (lint, format, test) and a gitleaks secret scan. Vitest is
  added to the web app so tests exist on both sides from the start.
- **Not now:** automatic deployment (no Systalink access yet), Dependabot (too much noise
  for a team still learning), CODEOWNERS (team details left out for now).

**GitHub enforcement is not on.** Tanny asked for `main` to be protected (pull request,
green CI and one approval required), squash-only merges with the pull request title as the
commit, and branches deleted after merge. None of this could be applied on 4 November
2026: the account doing the setup has write access but not admin, and the AI-UNIPOD
organisation is on GitHub Free, which does not offer branch protection or rulesets on
private repositories. Until an org admin applies it (which needs a paid plan or a public
repository), the rules in AGENTS.md hold by team agreement.

## Options we considered

- **Separate rule files per agent** (`CLAUDE.md`, `.cursorrules` and so on): they drift
  apart. One file, imported where needed, does not.
- **Path-filtered workflows, as in Project Sam:** faster on large repositories, but once
  checks become required, a skipped one can block a merge. Ours is small enough to check
  everything every time.
- **A `commitlint` npm package instead of the hook:** more dependencies for the same check.

## Consequences

- Every pull request gets the same checks, and every agent gets the same rules.
- Each pull request edits `CHANGELOG.md`, so two open pull requests can conflict there.
  The fix is to keep both lines.
- Commits made before this decision do not all meet the 72-character limit. History is not
  rewritten.
- Until GitHub enforcement is on, a direct push to `main` is still possible. If one
  happens, check what arrived and fix forward through a pull request.
