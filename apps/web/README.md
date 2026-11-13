# apps/web

The Village Sqwhere web app: Next.js (App Router) with TypeScript.

From the repository root:

```bash
pnpm install
pnpm dev:web      # http://localhost:3000
pnpm lint:web
pnpm test:web     # Vitest + Testing Library; tests sit next to the code as *.test.tsx
pnpm build:web
```

Copy `.env.example` from the repo root to `apps/web/.env.local` if you need to override the API URL.
The site is bilingual by address: pages live in `app/[lang]/` and are served at `/en` and `/fr`.
`proxy.ts` sends the bare `/` to the visitor's language, `app/locales.ts` lists the languages,
and each page's text lives in English and French together (see `app/landing/copy.ts`). The
landing page is `app/landing/`, and the onboarding page shown after the first sign-in is
`app/onboarding/` (at `/en/onboarding`). Its last screen saves the main role and the stack
through `POST /v1/me/roles` and `PUT /v1/me/technologies`; the country and topics stay in the tab.

A signed-in developer's home is the village, `app/village/` (at `/en/village`): who they are,
from `GET /v1/me` (`useMe()` in `app/session/me.ts`), and where they stand on the way to a
team. Onboarding's last screen leads there, and the bare onboarding address sends a developer
who already has a role there too. Screens for signed-in people share one header, `AppFrame` in
`app/app-frame.tsx`: pass it the screen's address so the language link opens the same screen.

Role verification is `app/verification/` (at `/en/verification`), for the developer's main role:
a start form (public GitHub repositories and a consent box), then the attempt's three stages
(repositories check, interview, peer review) read from `/v1/me/verifications`. It asks the API
again every 5 seconds only while the AI is working, and never shows the API's English error text.

The interview is `app/verification-interview/` (at `/en/verification/interview?id=`): a chat with
the AI interviewer over the attempt's WebSocket. The socket opens only when the developer presses
"Begin the interview", because the API ends the attempt for good if it closes early. While it is
live the header shows no links (`AppFrame`'s `locked`), and the token for the socket's address
comes from `accessToken()` in `app/session/session.ts`.

Peer review is `app/reviews/`: the queue at `/en/reviews` (attempts awaiting review in roles the
developer is verified in, never their own, with no AI score shown) and one case at
`/en/reviews/case?id=`. A case shows the evidence first (repositories, the interview, the
repositories check), then the AI's report marked as a suggestion, then the decision form: notes
are required, and pass or fail confirms in a dialog. Everything from `ai_result` is plain text.

Ideas are `app/ideas/`: your own at `/en/ideas/mine`, and the composer at `/en/ideas/compose`
(new) or `/en/ideas/compose?id=` (existing). The form keeps what everyone sees (title, summary)
apart from the private brief, saves only the fields that changed, and asks before publishing or
closing (`ConfirmDialog` in `app/confirm-dialog.tsx`, for anything that cannot be undone). The
app keeps pages in memory between visits, so a form is keyed by the id in its address.
Open ideas are at `/en/ideas`, and one idea's public page at `/en/ideas/view?id=`: the public
part only, a "Needs your role" line when a role slug matches, and how joining works (the owner
invites; there is no request to join).

Hubs are `app/hubs/`: create one from an open idea at `/en/hubs/new?idea=` (name, terms, the
agreement as the server sends it, a typed legal name, then a confirm dialog), one hub at
`/en/hubs/view?id=`, and your hubs at `/en/hubs`. The request carries the agreement's id and hash
that were shown; if the API says the agreement changed, the page shows the new text and asks
again. The agreement's Markdown is rendered by `agreement-text.tsx` as headings, lists and
paragraphs only, never as markup.

The profile is `app/profile/`, at `/en/profile`: the name and bio (`PATCH /v1/me`), the roles
(add, make main, remove; the page loads the profile again after each) and the stack
(`PUT /v1/me/technologies`), then the language and sign out. A developer with no role is sent to
onboarding first. The village's "Edit my profile" link opens it.

Sign-in starts at `/{lang}/sign-in` (`app/sign-in/`) and finishes at `/{lang}/auth/callback`
(`app/auth-callback/`), which keeps the tokens and opens onboarding in the language sign-in
started in. `app/session/` holds the rest: `useSession()` tells a page whether someone is
signed in, `apiFetch()` calls the API with the access token and refreshes it when it expires,
`signOut()` forgets the session and revokes it, and `RequireSession` sends signed-out visitors
to sign-in. Only the tokens are stored; pages read the profile from `GET /v1/me`. Style pages only with the design system tokens, imported in
`app/globals.css` from [`docs/design-system/`](../../docs/design-system/README.md), and use
`Logo` from `app/logo.tsx` for the logo and `Tooltip` from `app/tooltip.tsx` for icon buttons. See the root [CONTRIBUTING.md](../../CONTRIBUTING.md) for the team workflow.

An address that matches no page shows a not-found page in the address's language:
`app/[lang]/[...rest]` calls `notFound()` and `app/[lang]/not-found.tsx` renders it. An unknown
language, like `/xx/page`, gets the English version: every page under `[lang]` calls `notFound()`
for a language it does not know, and the root layout falls back to English. `global-not-found.tsx`
is not used, because `[lang]/[...rest]` matches every address, so no address is left unmatched.
Both use `app/page-not-found/`.
