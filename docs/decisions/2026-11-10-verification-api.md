# Verification API and peer review

## Context

The database already supports role verification with three attempts, asynchronous analysis
states and peer review. The API needed a contract for applicants and eligible reviewers.

## Decision

Verification starts at `/v1/me/verifications/{role_slug}`. The request accepts GitHub
repository URLs as evidence and creates a `pending` session. Applicants can list, poll and
abandon their attempts. Verified developers can list and decide cases for roles they hold.

The API records evidence and lifecycle state. A separate worker is responsible for repository
analysis and moving a session into `awaiting_review`. The session keeps its overall `status`
separate from `current_phase`, so applicants can see whether work is active and which AI phase
is running without adding a new lifecycle status for every phase. The codebase analysis service
accepts a provider-neutral analyzer interface and stores a validated, versioned result in
`ai_result`.

## Options we considered

- Put the role slug in the request body. We chose the URL because the role is the resource
  being verified and the existing role endpoints use slugs in paths.
- Complete GitHub analysis inside the HTTP request. We chose a pending session because
  repository analysis can be slow and needs a worker retry boundary.

## Consequences

The frontend has stable endpoints for polling and peer review has explicit role checks. The
frontend can now show the active AI phase. The live provider, GitHub permissions, worker queue,
and technical defence contract still need separate decisions before production analysis is
connected. Repository analysis uses bounded metadata snapshots and never executes repository
code. A GitHub API token is optional for public repositories and only changes the API rate
limit. The first model adapter uses Groq's OpenAI-compatible API with a deployment-configured
model name and validates structured JSON before persistence. Provider selection remains outside
the HTTP endpoint so a Gemini fallback can be added without changing the lifecycle contract.
The fallback uses Gemini's `generateContent` endpoint with JSON output configuration and the same
validated result contract.

The technical defence uses a WebSocket so audio, transcript progress, questions, and answer
acknowledgements share one authenticated session. Interview turns are append-only records tied to
the verification session. Binary audio is bounded before a transcriber receives it, and the
current phase changes to `report_generation` only after the applicant explicitly completes the
interview. Groq Whisper, Prompt Guard, and the interview question model are optional adapters at
runtime, so local tests and environments without provider credentials retain deterministic text
questions and never send audio to an unconfigured service.

The final report is a separate worker phase. It combines both evidence sources, stores the
reviewer-facing summary under `ai_result.final_report`, and only then exposes the session to the
existing peer-review queue. The evaluator cannot set `passed` or `failed`.

Final report evaluation uses the same provider fallback pattern as codebase analysis. Groq is the
primary evaluator and Gemini is used when Groq configuration or evaluation fails. Both outputs
are validated against the same report schema before the session enters peer review.
