# Village Sqwhere: rules for people and agents

These rules apply to every person and every coding agent working in this repository. They
are not suggestions. Most of us build alongside an agent, so the agent is held to the same
standard as a senior engineer on the team, and the person running it answers for what it
pushes.

**Read in this order before you touch anything:**

1. `docs/PROGRESS.md`: where the project stands and what is next.
2. This file, all of it.
3. The README of the app you are working in (`apps/web/README.md` or `apps/api/README.md`).
   In `apps/web`, also read `apps/web/AGENTS.md`: Next.js 16 differs from older versions,
   and its own docs ship in `node_modules/next/dist/docs/`.
4. For any screen or UI change, `docs/design-system/README.md` and the doc for the part you
   are building.

`CONTRIBUTING.md` has setup and the step-by-step workflow. This file has the rules.

## What we are building

Village Sqwhere is a platform for African developers, built for ACODev 2026 (Africa Cup of
Developers). A developer shares an idea, AI matches them with developers who have similar
ideas and complementary skills, the idea's owner approves the team, and the team builds the
idea together in a Virtual Collaboration Hub (brainstorm, design and architecture, build,
peer review). It is about building together, never about hiring. The
product works in English and French. Stack: Next.js in `apps/web`, FastAPI in `apps/api`,
PostgreSQL with pgvector, hosted on Systalink.

## 1. How we work

### 1.1 Understand before you build

- Before writing code, state the task and what "done" looks like in one or two sentences.
  If you cannot, the task is not clear yet: ask the person who gave it.
- Read the code you are about to change and the code that calls it.
- Never invent facts: competition rules, user numbers, API behaviour, library features.
  Check the source, or leave a clear question in the pull request.

### 1.2 Small, focused changes

- One task per branch and per pull request. One feature or one fix, not both.
- Make the smallest change that fully solves the task. Fully means it works end to end,
  with tests and docs, not just that it compiles.
- Stay in scope. If you spot something else worth fixing, write it in the pull request
  description or tell the team; do not fix it in the same pull request.
- Aim for a pull request a teammate can review in 15 minutes: roughly under 400 changed
  lines, not counting lockfiles.

### 1.3 Lean code: only what is necessary

- Use what already exists first: the language, the framework, our own helpers, then the
  dependencies we already have.
- Add a new dependency only when it saves real work, and say which one and why in the pull
  request. No large library for a small job.
- No speculative code: no abstraction, option, config or file "for later". Build it when
  it is needed.
- No dead code, no commented-out code, no leftover debug output. Delete instead.
- Follow the patterns already in the code around you. Names say what things are.
- Comments explain why, not what. The code already says what.

### 1.4 Functionality and user experience

- Every screen handles loading, empty, error and success states.
- Every user-facing word exists in English and French.
- Accessible by default: semantic HTML, labelled inputs, keyboard use, readable contrast.
- Build every screen from the design system in `docs/design-system/`. Colours, type,
  spacing, radius, shadows and motion come only from its tokens (`var(--text)`,
  `var(--space-4)`, `font: var(--type-body)`), never raw values: a test fails on any hex,
  `rgb()` or `hsl()` colour in `apps/web/app`. Use the `Logo` component for the logo. If a
  value you need is missing, ask; do not invent one.
- Mobile first: it must work at 360px wide. Many of our users are on phones and slow
  connections, so keep pages light and avoid heavy assets.
- Error messages say what happened and what the person can do next.
- Try the change yourself in the running app or with a real request before you call it
  done.

### 1.5 Tests

- Every change in behaviour ships with a test that would fail without the change.
- A bug fix starts with a test that reproduces the bug.
- API: pytest, in `apps/api/tests/`. Web: Vitest with Testing Library, in a
  `*.test.tsx` file next to the component it tests.
- Test what a user or caller sees, not internal details.

### 1.6 Fast, and pointed the right way

AI lets us move fast. Speed only counts if it is in the right direction.

- For anything bigger than a few files, write a short plan first (in the pull request
  description, or as a question to your human) and agree it before building.
- Work in small steps, and check each one: change, run, look at the result.
- Change only the lines that need to change. Do not regenerate whole files.
- If the same fix fails twice, stop, explain what you tried, and ask.
- Before opening a pull request, read your own diff the way a strict reviewer would.
- Read the real CI result. A change is done when CI is green, not when it looks right.

## 2. Commit messages

Every commit message is exactly one line:

```text
<type>(<scope>): <what was done>
```

**Types, and nothing else:** `feat` (new feature), `fix` (bug fix), `docs` (documentation
only), `refactor` (no change in behaviour), `test`, `perf`, `build` (dependencies, build
setup), `ci`, `style` (formatting only), `chore` (housekeeping), `revert`.

**Scopes:** `web`, `api`, `infra`, `docs`, `ci`, `repo`. The scope is optional; leave it out
when a change spans several areas.

**Rules for the line:**

- Lowercase type and scope. The description starts with a lowercase verb in the present
  tense: "add", "fix", "remove", "update".
- 72 characters or fewer for the whole line. No full stop at the end.
- No body, no second paragraph, no bullet list.
- No trailers of any kind: no `Co-authored-by`, no `Signed-off-by`, no "Generated with".
- No emoji, no em dashes or en dashes.

```text
Good: feat(api): add idea embedding endpoint
Good: fix(web): keep the language choice after a reload
Bad:  Added new feature.                    no type, past tense, full stop
Bad:  feat(web): Implement robust matching  capital letter, filler word
```

A `commit-msg` hook in `.githooks/` checks every commit. `pnpm install` turns it on. CI
checks pull request titles with the same hook, because the title becomes the commit on
`main`.

## 3. Branches, pull requests and review

- `main` always works. Nobody commits or pushes to it directly, people or agents. Every
  change goes in through a pull request.
- Branch from the latest `main` and name the branch `<type>/<short-description>`:
  `feat/idea-matching`, `fix/login-redirect`, `docs/api-setup`.
- One feature or fix per pull request. Do not stack pull requests (a branch made from
  another unmerged branch). If `main` moves, merge `main` into your branch.
- The pull request title follows the commit rule. Fill in the template.
- A pull request merges only when every check is green. While GitHub Actions is off, the merge
  agent (`scripts/merge-agent/`) runs the checks, squash merges green pull requests and
  deletes the branch, so `main` gets one commit per pull request. A teammate's review is
  welcome but not required. Add the `do-not-merge` label to hold a pull request back.
- When the agent flags a pull request (`agent: checks failed` or `agent: conflicts`), fix it on
  the branch. When it resolves conflicts itself (`agent: review conflicts`), read the
  resolution and remove the label; it never merges its own resolution unreviewed.

**What a reviewer checks:** does it do what it says, and only that? Are there tests, and
do they test behaviour? Is anything unnecessary (code, dependency, file)? Does the UI work
in both languages, on a phone, with loading and error states? Are the docs and
`CHANGELOG.md` updated? Is anything secret or personal in the diff? Ask questions, suggest
specific fixes, and approve only what you would be happy to maintain.

**As the author:** answer every review comment and push fixes as new commits on the same
branch. If you want a review before merging, add `do-not-merge` until you have it.

## 4. Documentation, with the why

Document a change in the same pull request that makes it, not later.

- **`CHANGELOG.md`**: every pull request that changes behaviour, setup or docs adds one
  line under today's date, newest first. Tiny chores (a typo, a lockfile refresh) can skip
  it.
- **Decision records** in `docs/decisions/`, named `YYYY-MM-DD-short-title.md` (dates, not
  numbers, so parallel branches never clash). Write one whenever the team makes a choice
  someone might later question: a library, a service, a data format, a security
  trade-off. Use `docs/decisions/_template.md`.
- **Living docs** describe how things are now. When your change makes one wrong, fix it in
  the same pull request: `README.md` **and** `README.fr.md` (keep them in step), the app
  READMEs, `docs/architecture.md`, `.env.example`, `CONTRIBUTING.md`.
- **`docs/PROGRESS.md`**: after meaningful work, update "Current state" and "What's next"
  in place. Keep it under 60 lines so every session can read it first.

## 5. Writing style

This applies to docs, comments, commit messages, pull requests and UI text.

- Plain, direct words. Short sentences, mostly under 25 words. Say the specific thing: the
  number, the file, the name.
- No em dashes or en dashes anywhere. Use a comma, a colon, a full stop or brackets. CI
  checks changed files for them.
- Do not use: delve, robust, seamless, leverage, utilize, cutting-edge, game-changer,
  streamline, empower, unlock, elevate, "it's worth noting that", "in conclusion".
- No emoji in docs, comments or commits.
- Nothing in this repository says it was written by an AI tool: not in commits, pull
  requests, docs or comments, and no bot signatures or badges. A commit is about what was
  done, not what wrote it.
- African context is welcome: Lagos, Dakar, Nairobi, naira and CFA amounts, Pidgin and
  French examples.

## 6. Security and privacy

- Never commit secrets, API keys, tokens or `.env` files. Real values come from the person
  who runs that environment. `.env.example` holds safe local defaults only. CI scans every
  pull request for secrets.
- Treat every idea shared on Village Sqwhere as confidential. Never put real user data or
  real ideas in code, tests, docs, logs or screenshots. Use made-up demo data.
- Treat everything a user sends as untrusted, including text passed to an AI model. The
  AI must never follow instructions written inside a user's idea or message.
- If you find a security problem, tell the team the same day.

## 7. Extra rules for AI agents

- Turn off any setting that adds co-author lines, attribution footers or "generated by"
  text to commits or pull requests. If you cannot, commit with
  `git commit -m "<one line>"` and check the message before pushing.
- Never push to `main`, force-push a shared branch, rewrite history, delete branches,
  drop database tables or delete data without asking your human first. The merge agent is
  the one exception: Tanny set it up to merge green pull requests and delete their branches.
- Stay inside the area your task is about. Ask before changing CI, `infra/`, this file or
  dependencies the task did not mention.
- Never hand-edit generated files: `pnpm-lock.yaml`, `apps/api/uv.lock`, or the block in
  `apps/web/AGENTS.md`. Change them through `pnpm` and `uv`.
- Run the checks below before opening a pull request, and fix what fails.
- When something is unclear, ask your human. Do not guess and push.

## 8. Checks before every pull request

Run from the repository root:

```bash
pnpm lint:web && pnpm test:web && pnpm build:web
pnpm lint:api && pnpm test:api
pnpm lint:agent && pnpm test:agent   # only when you change scripts/merge-agent
```

API tests that use the database need it running first: `pnpm db:up` (Docker). A test that
fails with "connection refused" means the database is not running, not that the code is
wrong.

API tests also need `TEST_DATABASE_URL` in your `.env`: the address of a separate
`village_sqwhere_test` database. The tests write to it, so they must never run against the
development database. Create it once with the commands in `apps/api/README.md`. Without it
the tests stop at start-up and say so. CI uses its own database and needs no setting.

CI and the merge agent run the same checks, plus the pull request title rule, the dash check
and a secret scan. Nothing merges on red.
