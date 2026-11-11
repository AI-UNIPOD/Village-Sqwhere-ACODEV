# Verification API and peer review

## Context

The database already supports role verification with three attempts, asynchronous analysis
states and peer review. The API needed a contract for applicants and eligible reviewers.

## Decision

Verification starts at `/v1/me/verifications/{role_slug}`. The request accepts GitHub
repository URLs as evidence and creates a `pending` session. Applicants can list, poll and
abandon their attempts. Verified developers can list and decide cases for roles they hold.

The API records evidence and lifecycle state. A separate worker is responsible for repository
analysis and moving a session into `awaiting_review`.

## Options we considered

- Put the role slug in the request body. We chose the URL because the role is the resource
  being verified and the existing role endpoints use slugs in paths.
- Complete GitHub analysis inside the HTTP request. We chose a pending session because
  repository analysis can be slow and needs a worker retry boundary.

## Consequences

The frontend has stable endpoints for polling and peer review has explicit role checks. The
worker contract, GitHub permissions and evidence format need a later decision before analysis
is connected.
