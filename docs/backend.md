# Village Sqwhere: Backend API Documentation for Frontend

This document is the dedicated guide for the frontend team (`apps/web`) to interact with the FastAPI backend (`apps/api`). It is updated with every new feature and change.

---

## 1. Quick Reference

* **Local API Base URL:** `http://localhost:8000/v1`
* **Interactive Swagger UI (Try endpoints live):** `http://localhost:8000/docs`
* **Alternative ReDoc UI:** `http://localhost:8000/redoc`

---

## 2. Global Conventions

### The Response Envelope
All successful responses are wrapped in a top-level `data` key:

* **Single Item:**
  ```json
  {
    "data": {
      "id": "0193f2a0-0c1e-7b2a-9f10-0000000000a1",
      "username": "ada-obi"
    }
  }
  ```
* **Lists:**
  ```json
  {
    "data": [
      { "slug": "backend-engineer", "name": "Backend & Systems Engineer" }
    ]
  }
  ```

### Authentication Header
Endpoints requiring authentication expect standard HTTP Bearer authentication:
```http
Authorization: Bearer <access_token>
```
If the token is missing, invalid, or expired, the API returns HTTP `401 Unauthorized`.

---

## 3. Currently Implemented Endpoints

### System

#### `GET /v1/health`
Health check endpoint to verify backend service liveness.

* **Authentication:** None
* **Success Response (200 OK):**
  ```json
  {
    "status": "ok",
    "version": "1.0.0"
  }
  ```

---

### Lookups & Vocabularies

### The Concept of Slugs in Village Sqwhere

Throughout Village Sqwhere, lookups (roles, technologies, topics) are identified by **slugs** rather than raw numeric IDs or display names.

* **What is a slug?** A lowercase, URL-safe, hyphen-separated string (for example: `backend-engineer`, `react-native`, `vector-databases`). Slugs conform to the regex `^[a-z0-9]+(-[a-z0-9]+)*$`.
* **Why use slugs instead of database IDs?**
  * **Environment Independence:** Integer IDs can change between local, staging, and production depending on migration order. Slugs remain permanent and immutable across all databases.
  * **Readability and Clean URLs:** Slugs can be placed directly into frontend routes (e.g., `/roles/frontend-engineer`) and API path parameters (`/v1/me/roles/{role_slug}`) without exposing database internals.
* **Why use slugs instead of display names?**
  * Display names contain spaces, slashes, and symbols (e.g., `AI / ML Engineer`, `Node.js`, `CI/CD`). Slugs avoid URL encoding and whitespace bugs.
  * Display names can be rebranded or localized in the UI without breaking backend API contracts or database foreign keys.
* **The Golden Rule for Frontend Developers & Agents:**
  * **Displaying in UI:** Always show `name` to human users (e.g., "DevOps & Cloud Engineer").
  * **Sending to API:** Always send `slug` in request payloads, path parameters, and query parameters (e.g., `"devops-cloud-engineer"`).
* **Single Taxonomy Notice:** The `technologies` lookup table is the platform's single source of truth for developer skills, project requirements, and feed topic tags. That is why both `PUT /v1/me/technologies` and `PUT /v1/me/feed-topics` accept lists of technology slugs.

---

#### `GET /v1/roles`
Fetches all active platform engineering roles (e.g. for registration, role pickers, or idea collaborator requirements).

* **Authentication:** None
* **Complete List of Seeded Roles (9 total):**

| Slug | Display Name |
| :--- | :--- |
| `ai-ml-engineer` | AI / ML Engineer |
| `backend-engineer` | Backend & Systems Engineer |
| `devops-cloud-engineer` | DevOps & Cloud Engineer |
| `embedded-iot-engineer` | Embedded Systems & IoT Engineer |
| `frontend-engineer` | Frontend Engineer |
| `mlops-data-engineer` | MLOps & Data Engineer |
| `mobile-engineer` | Mobile Engineer |
| `security-engineer` | Cybersecurity & Smart Contract Auditor |
| `ui-ux-engineer` | UI/UX Engineer & Product Architect |

* **Success Response (200 OK):**
  ```json
  {
    "data": [
      {
        "slug": "frontend-engineer",
        "name": "Frontend Engineer"
      },
      {
        "slug": "backend-engineer",
        "name": "Backend & Systems Engineer"
      }
    ]
  }
  ```
* **Frontend Note:** Use `slug` when sending requests to the API, and use `name` when displaying to users.

#### `GET /v1/technologies`
Search or browse active technologies, frameworks, and tools.

* **Authentication:** None
* **Query Parameters:**
  * `q` *(optional, string, 1 to 40 chars)*: Case-insensitive prefix search (e.g., `?q=py` returns Python, PyTorch).
  * `limit` *(optional, integer, 1 to 50, default: 20)*: Maximum number of results to return.
* **Complete List of Seeded Technologies (19 total):**

| Slug | Display Name |
| :--- | :--- |
| `ci-cd` | CI/CD |
| `computer-vision` | Computer Vision |
| `docker` | Docker |
| `flutter` | Flutter |
| `go` | Go |
| `java` | Java |
| `kubernetes` | Kubernetes |
| `llms` | LLMs |
| `nodejs` | Node.js |
| `postgresql` | PostgreSQL |
| `python` | Python |
| `pytorch` | PyTorch |
| `react` | React |
| `react-native` | React Native |
| `rust` | Rust |
| `tensorflow` | TensorFlow |
| `terraform` | Terraform |
| `vector-databases` | Vector Databases |
| `vue` | Vue |

* **Success Response (200 OK):**
  ```json
  {
    "data": [
      {
        "slug": "python",
        "name": "Python"
      },
      {
        "slug": "pytorch",
        "name": "PyTorch"
      }
    ]
  }
  ```

---

### Authentication

#### `POST /v1/auth/oauth/{provider}/start`
Starts the OAuth + PKCE sign-in flow. Only GitHub works today.

* **Authentication:** None
* **Path Parameters:**
  * `provider`: `github` (`bitbucket` is planned, and returns `503` until it is built)
* **Request Body:**
  ```json
  {
    "intent": "login",
    "redirect_uri": "http://localhost:8000/v1/auth/oauth/github/callback",
    "code_challenge": "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    "code_challenge_method": "S256"
  }
  ```
  `redirect_uri` is the API's callback URL, the same one registered on the GitHub OAuth app.
* **Success Response (200 OK):**
  ```json
  {
    "data": {
      "authorize_url": "https://github.com/login/oauth/authorize?client_id=...&redirect_uri=...&state=...",
      "expires_at": "2026-11-06T18:30:00Z"
    }
  }
  ```
* **Error Response (503):** `PROVIDER_NOT_CONFIGURED` when the provider is not set up on this server (for GitHub: `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are missing).
* **Frontend Flow:** Redirect the user's browser to `authorize_url` within 10 minutes. The `state` in it works once.

#### `GET /v1/auth/oauth/{provider}/callback`
Handles the redirect back from GitHub.

* **Authentication:** None
* **Query Parameters:**
  * `code`: One-time authorization code from GitHub. GitHub leaves it out, and sends `error=access_denied` instead, when the person clicks Cancel.
  * `state`: The state from `start`. It must have been issued by this server, for this provider, in the last 10 minutes, and not used before.
* **Behavior:** exchanges `code` with GitHub, creates or updates the user in Postgres, then redirects the browser with HTTP `302 Found`:
  * On success: `http://localhost:3000/auth/callback?login_code=lc_...` (the code is random, works once, and expires after 5 minutes).
  * On failure: `http://localhost:3000/auth/callback?error=CODE`, where `CODE` is `INVALID_STATE` (start again), `ACCESS_DENIED` (the person cancelled on GitHub, or GitHub refused the code) or `OAUTH_EXCHANGE_FAILED` (GitHub or the database could not be reached).
* **Email at sign-up:** a new account gets an email only when GitHub vouches for it. The API asks GitHub for the person's addresses (`GET /user/emails`, which the `user:email` scope allows) and saves the verified primary one, or else another verified one. GitHub noreply addresses are skipped. A saved email is marked verified (`email_verified` is `true` in `GET /v1/me`). The email on the public GitHub profile is never used by itself. The account is created with no email, and sign-in still works, when no address qualifies, when another account already has the address (capital letters do not matter), or when GitHub cannot be asked. Accounts that already exist are not changed.

#### `POST /v1/auth/token`
Exchanges a `login_code` (from the OAuth redirect) OR a `refresh_token` (to renew an expired session) for an active JWT `access_token` and rotated `refresh_token`.

* **Authentication:** None
* **Request Body Variant 1: Initial Login:**
  ```json
  {
    "grant_type": "login_code",
    "login_code": "lc_your_received_login_code",
    "code_verifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    "device_name": "Chrome on macOS"
  }
  ```
  `code_verifier` must be the PKCE verifier whose challenge was sent to `start`.
* **Request Body Variant 2: Refreshing an Expired Access Token:**
  ```json
  {
    "grant_type": "refresh_token",
    "refresh_token": "rt_your_current_refresh_token"
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "data": {
      "access_token": "eyJhbGciOi...",
      "token_type": "Bearer",
      "expires_in": 900,
      "refresh_token": "rt_...",
      "refresh_expires_at": "2026-12-06T18:00:00Z",
      "is_new_user": false,
      "user": {
        "id": "0193f2a0-0c1e-7b2a-9f10-0000000000a1",
        "username": "ada-obi",
        "display_name": "Ada Obi",
        "avatar_url": "https://avatars.githubusercontent.com/u/1001",
        "bio": "Backend engineer",
        "is_verified": false,
        "platform_role": "member",
        "roles": [],
        "technologies": [],
        "identities": [
          {
            "provider": "github",
            "provider_username": "ada-obi",
            "linked_at": "2026-11-06T18:00:00Z"
          }
        ],
        "created_at": "2026-11-06T18:00:00Z"
      }
    }
  }
  ```

#### `POST /v1/auth/logout`
Revokes the refresh token and signs out the session.

* **Authentication:** None
* **Request Body:**
  ```json
  {
    "refresh_token": "rt_..."
  }
  ```
* **Success Response (204 No Content):** Empty body.

---

### Current User (`/v1/me`)

#### `GET /v1/me`
Fetches the full profile of the currently signed-in user.

* **Authentication:** Bearer token required (`Authorization: Bearer <access_token>`)
* **Success Response (200 OK):**
  ```json
  {
    "data": {
      "id": "0193f2a0-0c1e-7b2a-9f10-0000000000a1",
      "username": "ada-obi",
      "display_name": "Ada Obi",
      "first_name": "Ada",
      "last_name": "Obi",
      "email": "ada@example.com",
      "email_verified": true,
      "avatar_url": "https://avatars.githubusercontent.com/u/1001",
      "bio": "Backend engineer in Lagos",
      "is_verified": true,
      "verified_at": "2026-11-06T18:00:00Z",
      "platform_role": "member",
      "roles": [
        {
          "slug": "backend-engineer",
          "name": "Backend & Systems Engineer",
          "is_primary": true,
          "verified_at": "2026-11-06T18:00:00Z",
          "verification": {
            "attempts_used": 1,
            "attempts_remaining": 2,
            "latest_status": "passed"
          }
        }
      ],
      "technologies": [
        { "slug": "python", "name": "Python" },
        { "slug": "postgresql", "name": "PostgreSQL" }
      ],
      "feed_topics": [],
      "identities": [
        {
          "provider": "github",
          "provider_username": "ada-obi",
          "linked_at": "2026-11-06T18:00:00Z"
        }
      ],
      "created_at": "2026-11-06T18:00:00Z"
    }
  }
  ```

#### `PATCH /v1/me`
Updates editable fields on the user's profile.

* **Authentication:** Bearer token required (`Authorization: Bearer <access_token>`)
* **Request Body:** *(All fields are optional; send only fields to update)*
  ```json
  {
    "display_name": "Ada O.",
    "bio": "Updated bio description",
    "first_name": "Ada",
    "last_name": "Obi",
    "email": "new-email@example.com"
  }
  ```
* **Limits:** `display_name` 1 to 80 characters, `first_name` and `last_name` 1 to 100, after spaces at the start and end are removed. `bio` up to 1000 characters. `email` must look like `name@example.com`. A new email is saved as not verified.
* **Success Response (200 OK):** Returns the full updated user profile wrapped in `{"data": { ... }}`.
* **Error Responses:** `422` when a field breaks a limit (the error names the field). `409` `EMAIL_TAKEN` when another account already uses the email, in any mix of upper and lower case.

#### `POST /v1/me/roles`
Claims a developer role for the authenticated user (e.g. during onboarding or profile editing).

* **Authentication:** Bearer token required (`Authorization: Bearer <access_token>`)
* **Request Body:**
  ```json
  {
    "role": "backend-engineer",
    "is_primary": false
  }
  ```
  * `role` *(required, string)*: Role slug from `GET /v1/roles`.
  * `is_primary` *(optional, boolean, default: false)*: Set to `true` to make this the primary role (unsets primary on any other claimed role).
* **Success Response (201 Created):**
  ```json
  {
    "data": {
      "slug": "backend-engineer",
      "name": "Backend & Systems Engineer",
      "is_primary": false,
      "verified_at": null,
      "verification": {
        "attempts_used": 0,
        "attempts_remaining": 3,
        "latest_status": null
      }
    }
  }
  ```
* **Error Responses:**
  * `409 Conflict`: `{"detail": {"code": "ROLE_ALREADY_CLAIMED", "message": "You already have this role."}}`
  * `422 Unprocessable Content`: `{"detail": {"code": "UNKNOWN_SLUG", "message": "Unknown role slug: '...'"}}`

#### `PATCH /v1/me/roles/{role_slug}`
Designates an already-claimed role as the user's primary discipline. Automatically demotes any other currently primary role.

* **Authentication:** Bearer token required (`Authorization: Bearer <access_token>`)
* **Request Body:**
  ```json
  {
    "is_primary": true
  }
  ```
* **Success Response (200 OK):** Returns the updated `UserRole` object wrapped in `{"data": { ... }}` with `is_primary: true`.
* **Error Responses:**
  * `404 Not Found`: `{"detail": {"code": "NOT_FOUND", "message": "Role '...' is not claimed."}}`
  * `422 Unprocessable Content`: `{"detail": {"code": "VALIDATION_FAILED", "message": "is_primary must be true"}}`

#### `DELETE /v1/me/roles/{role_slug}`
Removes a claimed role from the user's profile.

* **Authentication:** Bearer token required (`Authorization: Bearer <access_token>`)
* **Success Response (204 No Content):** Empty body.
* **Important Business Rule / Errors:**
  * If the user has started or completed any verification attempt for this role, deletion is refused to preserve the 3-attempt audit trail:
    `409 Conflict`: `{"detail": {"code": "ROLE_HAS_VERIFICATION_HISTORY", "message": "A role with verification attempts can't be removed (it would reset the 3-attempt limit)."}}`
  * `404 Not Found`: `{"detail": {"code": "NOT_FOUND", "message": "Role '...' is not claimed."}}`

#### `PUT /v1/me/technologies`
Full replacement of the developer's tech stack (skills and tools).

* **Authentication:** Bearer token required (`Authorization: Bearer <access_token>`)
* **Request Body:**
  ```json
  {
    "technologies": [
      "python",
      "postgresql",
      "go"
    ]
  }
  ```
  * `technologies` *(required, array of strings, 0 to 30 items)*: Slugs from `GET /v1/technologies`. No duplicates.
* **Success Response (200 OK):**
  ```json
  {
    "data": [
      { "slug": "python", "name": "Python" },
      { "slug": "postgresql", "name": "PostgreSQL" },
      { "slug": "go", "name": "Go" }
    ]
  }
  ```
* **Error Responses:**
  * `422 Unprocessable Content`: `{"detail": {"code": "UNKNOWN_SLUG", "message": "Unknown technology slugs: ..."}}`
  * `422 Unprocessable Content`: `{"detail": {"code": "VALIDATION_FAILED", "message": "Duplicate technologies are not allowed."}}`

#### `PUT /v1/me/feed-topics`
Full replacement of feed preference topics. An empty array `[]` means "show everything".

* **Authentication:** Bearer token required (`Authorization: Bearer <access_token>`)
* **Important Schema Rule for Frontend:**
  The request JSON key MUST be named `"technologies"` (NOT `"topics"`), because feed topics reference the platform's canonical `technologies` lookup table.
* **Request Body:**
  ```json
  {
    "technologies": [
      "react",
      "flutter"
    ]
  }
  ```
  * `technologies` *(required, array of strings, 0 to 50 items)*: Valid slugs from `GET /v1/technologies`. No duplicates.
  * To clear all feed topics and show everything on the feed, pass an empty array: `{"technologies": []}`.
* **Success Response (200 OK):** Returns the list of saved topic `TechnologyRef` objects wrapped in `{"data": [ ... ]}`.
* **Error Responses:**
  * `422 Unprocessable Content`: `{"detail": {"code": "UNKNOWN_SLUG", "message": "Unknown technology slugs: ..."}}` (Returned if any slug is not in the `technologies` lookup table).
  * `422 Unprocessable Content`: `{"detail": {"code": "VALIDATION_FAILED", "message": "Duplicate topics are not allowed."}}`
  * `422 Unprocessable Content`: `{"detail": [{"loc": ["body", "technologies"], "msg": "Field required"}]}` (Returned if the JSON key was named `"topics"` instead of `"technologies"`).

### Experience verification

Verification attempts are tied to a claimed role. A developer has up to three attempts for
each role. The start endpoint records GitHub repository evidence and creates a `pending`
session. Analysis can update the session later; the API does not claim that analysis is done
when the session is created.

The response includes `current_phase` while AI work is active. It is `codebase_analysis` when
the session is waiting for or receiving repository analysis, `technical_defence` when the
analysis is complete and the interview can begin, and `report_generation` while the final
review brief is being prepared. It is `null` for terminal states and `awaiting_review`.

The codebase analysis service reads public GitHub repository metadata, languages, a bounded file
tree, test paths and recent commits. `GITHUB_API_TOKEN` is optional. Without it, public
repositories use GitHub's unauthenticated rate limit. Repository code is never executed.

The Groq codebase adapter is configured with `GROQ_API_KEY` and `GROQ_CODEBASE_MODEL`. It sends
the bounded snapshot to the configured model, requests JSON, and validates the response before
storing it. The adapter is not called directly by an HTTP endpoint.

The worker claims one pending codebase analysis with a row lock. It keeps that transaction open
while the external analysis runs, preventing two workers from processing the same session. A
successful run stores the result and advances `current_phase` to `technical_defence`.

`analysis_attempts` and `last_error` are returned to the applicant for progress reporting. A
failed run returns to `pending` and can be claimed again until
`VERIFICATION_MAX_ANALYSIS_ATTEMPTS` is reached. The primary Groq analyzer falls back to the
configured Gemini analyzer after a Groq configuration or API error.

#### `WS /v1/me/verifications/{session_id}/interview`

The applicant opens this WebSocket after the session reaches `technical_defence`. The access
token is supplied as the `token` query parameter during the connection handshake. The server
sends `assistant_message`, `question`, `answer_saved`, `audio_buffered`, `error`,
`interview_complete`, and `interview_incomplete` events. An `assistant_message` has a `kind` of
`welcome`, `acknowledgement`, or `closing`, plus its text. The welcome explains the interview
before question one. Each saved answer receives a neutral acknowledgement before the next
question. The closing signs the applicant off after answer five.
Text answers use `{"type":"answer","text":"..."}`. Audio is sent as binary frames and is
closed with `{"type":"answer_end"}`. With `GROQ_API_KEY` configured, the server sends the
audio to `GROQ_STT_MODEL`, checks the transcript with `GROQ_GUARD_MODEL`, and gets the next
question from `GROQ_INTERVIEW_MODEL`. If Groq is unavailable or returns invalid structured output,
the conversation falls back to `GEMINI_INTERVIEW_MODEL`. If neither provider is available,
deterministic conversation keeps text interviews usable. Questions one to three cover architecture
and ownership, role fundamentals, and testing and reliability. Questions four and five use the
codebase analysis and prior answers for adaptive depth, trade-offs, and problem solving. Audio
reports `TRANSCRIPTION_UNAVAILABLE` when transcription is not configured.

An audio answer can name its type with the optional `audio_content_type` query parameter,
which defaults to `audio/webm`. The value must be one of `audio/webm`, `audio/webm;codecs=opus`,
`audio/ogg`, `audio/ogg;codecs=opus`, `audio/mp4`, `audio/mpeg`, `audio/wav`, `audio/x-wav` or
`audio/flac`, in any letter case. Anything else gets an `AUDIO_TYPE_NOT_ALLOWED` error and the
buffered audio is dropped, and only a value from this list is ever sent to the speech provider.

Each answer is checked with `GROQ_GUARD_MODEL`. When `GROQ_API_KEY` or `GROQ_GUARD_MODEL` is not
set nothing is checked, so every answer is flagged `guard_not_configured`. A flag is saved with
the answer, sent to the client as `{"type":"security_signal","severity":"warning","code":"..."}`
and passed to the report generator, so peer reviewers can see that nothing was screened.

The interview allows `VERIFICATION_INTERVIEW_MAX_TURNS` answered turns, which defaults to five.
The applicant cannot complete the interview manually. After the final answer is saved, the
server sends `interview_complete` and sets `current_phase` to `report_generation`. Sending a
client `complete` event is not supported. If the applicant sends `abandon`, or the WebSocket
disconnects before the limit, the interview is marked `incomplete` and the verification session
is abandoned. An incomplete interview does not enter report generation or peer review.

Welcome, acknowledgement, question, answer, security flag, and closing text are persisted. The
report worker stores this under `ai_result.interview_transcript`, combines the codebase result and
interview turns, validates the structured evaluator output, and stores the report under
`ai_result.final_report`. It then changes the session to `awaiting_review`. The human peer-review
endpoints remain the only path to `passed` or `failed`.

Run the worker loop with:

```bash
uv run --directory apps/api python -m app.workers.runner
```

It polls both queues every `VERIFICATION_WORKER_INTERVAL_SECONDS` seconds. Each job is claimed
with a database row lock, and a failed job is logged while the loop continues.

Final report evaluation uses `GROQ_EVALUATION_MODEL` first and falls back to
`GEMINI_EVALUATION_MODEL`. Both providers must return the same validated report shape.

#### `POST /v1/me/verifications/{role_slug}`

Starts a verification attempt for one of the signed-in developer's claimed roles.

* **Authentication:** Bearer token required
* **Request Body:**
  ```json
  {
    "repositories": ["https://github.com/example/project"]
  }
  ```
* **Success Response (201 Created):** Returns the new verification session in `data`.
* **Errors:** `404 ROLE_NOT_CLAIMED`, `409 VERIFICATION_IN_PROGRESS`,
  `409 ROLE_ALREADY_VERIFIED` or `409 VERIFICATION_ATTEMPTS_EXHAUSTED`.

#### `GET /v1/me/verifications`

Lists the signed-in developer's attempts. Optional query parameters are `role_slug`,
`status`, `offset` and `limit`. The response includes `next_offset` when more results exist.

#### `GET /v1/me/verifications/{session_id}`

Returns one attempt for its applicant. The frontend can poll this endpoint while analysis is
running.

#### `POST /v1/me/verifications/{session_id}/abandon`

Moves an active attempt to `abandoned`. A passed, failed or already abandoned attempt cannot
be changed.

#### `GET /v1/reviews/verifications`

Lists attempts in `awaiting_review` for roles in which the signed-in user is verified. An
applicant's own attempt never appears in their queue.

#### `GET /v1/reviews/verifications/{session_id}`

Returns a review case when the signed-in user is an eligible reviewer for that role.

#### `POST /v1/reviews/verifications/{session_id}/decision`

Records a peer review decision:

```json
{
  "decision": "passed",
  "notes": "Evidence reviewed."
}
```

Only `passed` and `failed` are accepted. A reviewer must be verified in the applicant's role,
cannot review their own attempt, and cannot decide a case that is no longer awaiting review.

---

## 4. Frontend Integration Guide: Authentication

### How the Sign-In Flow Works for End Users (100% Automated)
In production and regular use, **the user never touches or sees a `login_code`**. The frontend coordinates the handshake automatically:

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant Web as Next.js Frontend
    participant API as FastAPI Backend (/v1)
    participant GH as GitHub OAuth

    User->>Web: Clicks "Sign in with GitHub"
    Web->>API: POST /v1/auth/oauth/github/start
    API-->>Web: Returns authorize_url
    Web->>GH: Redirects window.location.href to authorize_url
    User->>GH: Clicks "Authorize"
    GH->>API: Redirects to backend callback (/v1/auth/oauth/github/callback?code=...)
    Note over API: Backend exchanges code with GitHub,<br/>upserts user in Postgres, generates login_code
    API-->>Web: Redirects to http://localhost:3000/auth/callback?login_code=lc_...
    Note over Web: Callback page automatically extracts login_code from URL
    Web->>API: POST /v1/auth/token { grant_type: "login_code", login_code, code_verifier }
    API-->>Web: Returns access_token (15m), refresh_token (30d), user profile
    Web->>Web: Saves tokens in memory/storage
    Web-->>User: Redirects to dashboard (/feed or /onboarding)
```

### Signing in during local development
There is no sign-in bypass: every sign-in goes through GitHub, so a made-up `login_code` is always refused. To sign in locally, create a GitHub OAuth app for yourself (see `.env.example`) and put its client ID and secret in your `.env`. Tests fake GitHub's side of the exchange instead (see `apps/api/tests/conftest.py`).

### How the Frontend Signs In

#### Steps
1. Generate PKCE pair (`code_verifier` and `code_challenge`). Store `code_verifier` in `sessionStorage`.
2. Frontend calls `POST /v1/auth/oauth/github/start` passing `code_challenge`.
3. Redirects browser to `authorize_url`.
4. User authorises on GitHub.
5. Browser lands back on `/auth/callback?login_code=lc_...`.
6. Frontend retrieves `code_verifier` from `sessionStorage` and calls `POST /v1/auth/token` with `{ grant_type: "login_code", login_code, code_verifier }`.

#### Ready-to-use PKCE Helper for Frontend (`apps/web`):
The frontend can drop this standard helper directly into its codebase (uses native Web Crypto API, 0 external packages required):

```typescript
// pkce.ts
export async function generatePKCE() {
  // 1. Generate random code_verifier (43-128 chars)
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  const code_verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // 2. Hash it with SHA-256 to create code_challenge
  const encoder = new TextEncoder();
  const data = encoder.encode(code_verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  const code_challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // Save verifier in sessionStorage to verify during token exchange
  sessionStorage.setItem("pkce_verifier", code_verifier);

  return { code_challenge, code_verifier };
}
```

---

### Silent Token Refreshing (Staying Logged In)
* Access tokens expire every **15 minutes** (`900 seconds`).
* Refresh tokens remain valid for **30 days**.
* The frontend HTTP client (e.g., Axios interceptor or custom `fetch` wrapper) should intercept HTTP `401 Unauthorized` responses and silently call:
  ```http
  POST /v1/auth/token
  Content-Type: application/json

  {
    "grant_type": "refresh_token",
    "refresh_token": "<stored_refresh_token>"
  }
  ```
* Save the new `access_token` and the new rotated `refresh_token`, then retry the original failed request. The user experiences zero interruption.
* Refresh tokens, login codes and OAuth states are kept in the API's memory for now. A restart cancels sign-ins in progress and forgets logouts (a logged-out refresh token works again until it expires), so run a single API process. See `docs/decisions/2026-11-07-sign-in-without-dev-login.md`.

---

## Posts (Developer Exchange)

The Developer Exchange allows developers to share knowledge, questions, releases, and architecture challenges.

### Error Shapes

1. **Custom business logic errors** return a structured JSON object with a specific error code:
   ```json
   {
     "detail": {
       "code": "POST_NOT_FOUND",
       "message": "Post not found or deleted"
     }
   }
   ```
2. **Schema validation errors** (from Pydantic) return FastAPI's default list format:
   ```json
   {
     "detail": [
       {
         "type": "string_too_short",
         "loc": ["body", "body"],
         "msg": "String should have at least 1 characters",
         "input": ""
       }
     ]
   }
   ```

### Error Codes for Posts

| Code | Status | Reason |
| :--- | :--- | :--- |
| `POST_NOT_FOUND` | 404 | Post does not exist, is soft-deleted, or belongs to a hub |
| `NOT_POST_AUTHOR` | 403 | Attempt to edit or delete another user's post |
| `HUB_MILESTONE_NOT_SUPPORTED` | 422 | Attempt to create a post with `type = "hub_milestone"` |
| `UNKNOWN_TOPIC` | 422 | A topic slug does not exist in the technologies table |
| `EMPTY_UPDATE` | 422 | PATCH body contains no fields |
| `TOO_MANY_TOPICS` | 422 | More than 5 topics submitted |
| `DUPLICATE_TOPICS` | 422 | Duplicate topic slugs submitted |
| `RFC_TITLE_REQUIRED` | 422 | Attempt to clear title on an RFC post |

---

### `POST /v1/posts`

Create a new feed post.

* **Authentication:** Required (Bearer token)
* **Topic rules:** Maximum 5 topics. No duplicate slugs. Each slug must match a technology in the technologies table.
* **Hub milestone:** `type = "hub_milestone"` is currently deferred and returns HTTP 422 `HUB_MILESTONE_NOT_SUPPORTED`.
* **Request Body:**
  ```json
  {
    "type": "general",
    "title": "Async Python with PostgreSQL",
    "body": "Tips and patterns for async connection pooling with asyncpg and PostgreSQL.",
    "link_url": "https://github.com/example/async-postgres-guide",
    "topics": ["python", "postgresql"]
  }
  ```
* **Success Response (201 Created):**
  ```json
  {
    "data": {
      "id": "1894d039-3fa4-469b-9878-8314f3ff5e0d",
      "type": "general",
      "title": "Async Python with PostgreSQL",
      "body": "Tips and patterns for async connection pooling with asyncpg and PostgreSQL.",
      "link_url": "https://github.com/example/async-postgres-guide",
      "author": {
        "id": "908fdc10-d867-4279-bb7d-b6a2f7c00e12",
        "username": "ada-lagos",
        "display_name": "Ada Okafor",
        "avatar_url": null,
        "is_verified": true
      },
      "topics": [
        { "slug": "postgresql", "name": "PostgreSQL" },
        { "slug": "python", "name": "Python" }
      ],
      "like_count": 0,
      "comment_count": 0,
      "created_at": "2026-11-13T10:00:00Z",
      "updated_at": "2026-11-13T10:00:00Z",
      "edited_at": null,
      "liked_by_me": false,
      "saved_by_me": false
    }
  }
  ```

---

### `GET /v1/posts/{post_id}`

Retrieve a single post by ID.

* **Authentication:** Required (Bearer token)
* **Visibility:** Returns HTTP 404 `POST_NOT_FOUND` if the post does not exist, has been deleted, or has `hub_id IS NOT NULL`.
* **Success Response (200 OK):**
  Same shape as `POST /v1/posts`, with current user's `liked_by_me` and `saved_by_me` flags.

---

### `PATCH /v1/posts/{post_id}`

Update a post's title, body, or link URL.

* **Authentication:** Required (Author only). Non-authors receive HTTP 403 `NOT_POST_AUTHOR`.
* **Rules:**
  * At least one field must be provided. An empty payload returns HTTP 422 `EMPTY_UPDATE`.
  * Passing `title: null` clears the title for standard posts, but returns HTTP 422 for RFC posts.
  * Passing `body: null` is rejected.
  * Topics and post type are immutable and cannot be updated.
  * Each text change creates an audit row in `post_revisions` and updates `edited_at` automatically.
* **Request Body:**
  ```json
  {
    "title": "Updated Title",
    "body": "Updated body text with clarifications."
  }
  ```
* **Success Response (200 OK):**
  Updated post object in the `{"data": ...}` envelope.

---

### `DELETE /v1/posts/{post_id}`

Soft-delete a post.

* **Authentication:** Required.
* **Permissions:**
  * Post author can delete (records deletion reason `author`).
  * Platform moderators and admins can delete (records deletion reason `moderator`).
  * If the author is also a moderator, the `author` reason takes precedence.
  * Non-authors without moderator rights receive HTTP 403 `NOT_POST_AUTHOR`.
* **Visibility:** Once deleted, the post returns HTTP 404 `POST_NOT_FOUND` to all future GET and PATCH requests.
* **Success Response (204 No Content):** Empty body.


---

### `GET /v1/posts`

List visible posts, newest first. Deleted posts and hub posts never appear.

* **Authentication:** Required (Bearer token)
* **Query parameters (all optional, combine freely):**
  * `type`: one post type, for example `question`. An unknown type returns 422.
  * `topic`: one technology slug, for example `python`.
  * `author`: a username, in any case. The profile page lists a developer's posts with it.
  * `offset` (default 0, at most 100000) and `limit` (default 20, at most 50).
* An unknown topic or author returns an empty list. A malformed one (not a slug or a
  username) returns 422.
* **Success Response (200 OK):**
  ```json
  {
    "data": [ { "id": "...", "type": "question", "title": null, "body": "...", "author": { "username": "ada-lagos" }, "topics": [], "liked_by_me": false, "saved_by_me": true } ],
    "next_offset": 20
  }
  ```
  Each item has the same shape as `GET /v1/posts/{post_id}` (shortened here).
  `next_offset` is `null` on the last page; otherwise send it as `offset` for the next page.

---

### `GET /v1/feed`

The signed-in developer's feed, newest first, paged like `GET /v1/posts`.

* **Authentication:** Required (Bearer token)
* Shows posts that share a topic with the developer's feed topics (`PUT /v1/me/feed-topics`),
  plus every post they wrote.
* With no feed topics chosen, it shows every post. `GET /v1/me` tells the app whether
  `feed_topics` is empty, so it can invite the developer to pick some.
* New posts can shift later pages, so skip post ids already on screen.
* Why: `docs/decisions/2026-11-13-post-feed-and-lists.md`.

---

### `PUT` and `DELETE /v1/posts/{post_id}/like`, `PUT` and `DELETE /v1/posts/{post_id}/save`

Like or unlike a post, save or unsave it.

* **Authentication:** Required (Bearer token). Anyone signed in, the author included.
* `PUT` adds the like or save, `DELETE` removes it. Both are safe to send again: a second
  like changes nothing and `like_count` counts each developer once.
* **Success Response (204 No Content):** Empty body. Read `like_count`, `liked_by_me` and
  `saved_by_me` from the post when you need the new values.
* A missing, deleted or hub post returns HTTP 404 `POST_NOT_FOUND`.

---

### `GET /v1/me/saved-posts`

The signed-in developer's saved posts, most recently saved first, paged like
`GET /v1/posts`. Posts deleted after saving drop out of the list.

* **Authentication:** Required (Bearer token)
* **Success Response (200 OK):** Same shape as `GET /v1/posts`.
