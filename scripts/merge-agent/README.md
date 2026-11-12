# Merge agent

A script that tests every open pull request into `main` and squash merges the ones that
pass. It runs on one teammate's Windows machine every 5 minutes, because GitHub Actions is
off (see `docs/PROGRESS.md`). Why it works this way:
[`docs/decisions/2026-11-13-merge-agent.md`](../../docs/decisions/2026-11-13-merge-agent.md).

## What it does

For each open pull request into `main`, oldest first:

1. **Skips** drafts, pull requests from forks, and any with the `do-not-merge` label.
2. **Tests** the pull request merged with the latest `main`, with the same checks as
   `.github/workflows/ci.yml`: the title rule, the dash check, web install, lint, test and
   build, a fresh test database from `infra/db/init/`, API install, lint and test, this
   agent's own lint and tests, and the gitleaks secret scan. Everything that runs the pull
   request's code runs in Docker containers, on a network of their own with a throwaway
   database, and the containers are removed afterwards.
3. **Merges** when every check passes: a squash merge titled `<pull request title> (#<number>)`,
   only if neither the branch nor `main` moved since the checks. Then it **deletes the branch**,
   unless the branch is `main`, changed after the merge, or is used by another open pull request.
4. **Flags** a failure: the `agent: checks failed` label and one comment with the failed step,
   a short explanation from Claude Haiku and the end of the log. It does not merge.
5. **Resolves conflicts** with Claude Sonnet, which may only read and edit the conflicted files
   in the agent's clone. Lockfiles are rebuilt with `pnpm` and `uv`, never edited. The script
   then checks that no conflict markers are left and no other file changed, runs every check,
   and pushes a normal merge commit to the branch. It labels the pull request
   `agent: review conflicts` and comments with the exact resolution. **It merges only after a
   person removes that label.**
6. **Leaves conflicts to a person** (`agent: conflicts` label and a comment) when they are in
   `.github/`, `infra/`, `AGENTS.md` or this folder, or when the automatic resolution fails.

Nothing is tested twice: it remembers the commit and `main` it last checked for each pull
request. Pushing to the branch, `main` moving, or removing an `agent:` label makes it look again.

## What it needs

On the machine that runs it, all signed in as the person whose account merges:

- The [GitHub CLI](https://cli.github.com/), signed in (`gh auth login`) with admin or write
  access to the repository.
- [Claude Code](https://claude.com/claude-code), signed in (`claude`). Without it, the agent
  still tests and merges, but explains no failures and resolves no conflicts.
- Git for Windows, uv (to run the agent), and Docker Desktop, running. The checks use pinned
  images for Postgres with pgvector, Node.js, uv and gitleaks, pulled on the first run. Each
  run makes its own throwaway database, so the agent needs no `.env` file, no database URL
  and never touches your development database. Without Docker it tests and merges nothing.

No environment variables are required. Two are optional:

| Variable | Default |
| --- | --- |
| `MERGE_AGENT_HOME` | `%LOCALAPPDATA%\village-sqwhere-merge-agent` (clone, state, logs) |
| `MERGE_AGENT_REPO` | `AI-UNIPOD/Village-Sqwhere-ACODEV` |

## Use it

Try it first without changing anything on GitHub. This tests and logs what it would do:

```bash
pnpm merge-agent --dry-run
pnpm merge-agent --dry-run --pr 12   # one pull request
```

Then install it in Windows Task Scheduler (PowerShell, from the repository root):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/merge-agent/install-task.ps1
```

The task copies `merge_agent.py` to `MERGE_AGENT_HOME` and runs that copy, so run the install
again after the agent changes on `main`.

| To | Do |
| --- | --- |
| See what it did | Read `agent.log` and `logs\` in `MERGE_AGENT_HOME` |
| Keep it off one pull request | Add the `do-not-merge` label |
| Retry the same commit | Remove its `agent:` label |
| Pause it | Create an empty file named `PAUSED` in `MERGE_AGENT_HOME`; delete it to resume |
| Remove it | `Unregister-ScheduledTask -TaskName VillageSqwhereMergeAgent -Confirm:$false` |

## Limits

- It runs each pull request's code (install, tests, build) in containers that get the files
  but no `.git` folder, no folder or variable from that machine, and no extra privileges. They
  still share Docker Desktop's virtual machine, have internet access (installs and the web
  build's fonts need it) and could reach services on that machine through
  `host.docker.internal`. Pull requests from forks are skipped.
- It runs only while that machine is on and signed in, and Docker Desktop is running.
- Merges, comments and pushes appear under that person's GitHub account.
- A failure caused by the machine (no network during `pnpm install`, for example) is reported
  like any other. Remove the label to retry.
- Comments are plain text from a script. They follow the writing rules in `AGENTS.md`.

## Change it

`merge_agent.py` is one file with no dependencies beyond Python 3.13. The functions that decide
what to do are covered by `test_merge_agent.py`:

```bash
pnpm lint:agent && pnpm test:agent
```
