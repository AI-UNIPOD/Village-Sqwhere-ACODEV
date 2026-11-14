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
`proxy.ts` sends the bare `/`, and any address typed without a language, to the visitor's
language, `app/locales.ts` lists the languages,
and each page's text lives in English and French together (see `app/landing/copy.ts`). The
landing page is `app/landing/`: the hero (its headline is edited into shape once by a layer over
the real text: `hero-headline.tsx`, words in `hero-headline-copy.ts`), then one file per section in
`app/landing/sections/` (each with its own copy, styles and tests), and the onboarding page shown after the first sign-in is
`app/onboarding/` (at `/en/onboarding`). Its last screen saves the main role, the stack, the
technologies the feed should show and the sectors (`POST /v1/me/roles`,
`PUT /v1/me/technologies`, `PUT /v1/me/feed-topics`, `PUT /v1/me/sectors`); the country stays
in the tab until the API can store it.

A signed-in developer's home is the village, `app/village/` (at `/en/village`): who they are,
from `GET /v1/me` (`useMe()` in `app/session/me.ts`), and where they stand on the way to a
team. Onboarding's last screen leads there, and the bare onboarding address sends a developer
who already has a role there too. Screens for signed-in people share one frame, `AppFrame` in
`app/app-frame.tsx`: pass it the screen's address so the language link opens the same screen.
The frame also holds the places (village, feed, ideas, hubs, reviews for a verified developer,
profile): a bar at the bottom of a phone, links in the header from 768px. A new place is one
line in `PLACES` and one word in `app/app-frame-copy.ts`. The profile is kept for the visit, so
a screen opened later shows at once; a screen that changes it calls `loadMe()` or `keepMe()`.
The frame asks for the profile itself when no screen has, sharing one request with the screen.
Screens crossfade with React's `<ViewTransition>` (`globals.css`), and a sticky row at the
bottom of a screen uses `var(--app-bottom)` to sit above the bar.

Role verification is `app/verification/` (at `/en/verification`), for the developer's main role:
a start form (public GitHub repositories and a consent box), then the attempt's three stages
(repositories check, interview, peer review) read from `/v1/me/verifications`. It asks the API
again every 5 seconds only while the AI is working, and never shows the API's English error text.
Starting sends `language`, the language of the page, and the form says so before the button: the
interview and the AI's report use it and it never changes for that attempt. An active attempt in
a different language from the page says so in one line.

The interview is `app/verification-interview/` (at `/en/verification/interview?id=`): a chat with
the AI interviewer over the attempt's WebSocket. The socket opens only when the developer presses
"Begin the interview", because the API ends the attempt for good if it closes early. While it is
live the header shows no links (`AppFrame`'s `locked`), and the token for the socket's address
comes from `accessToken()` in `app/session/session.ts`. The interview is written by the API in
the attempt's language, so the screen's own text follows the page and the questions follow the attempt.

Peer review is `app/reviews/`: the queue at `/en/reviews` (attempts awaiting review in roles the
developer is verified in, never their own, with no AI score shown) and one case at
`/en/reviews/case?id=`. A case shows the evidence first (repositories, the interview, the
repositories check), then the AI's report marked as a suggestion, then the decision form: notes
are required, and pass or fail confirms in a dialog. Everything from `ai_result` is plain text.
Each queue row names the attempt's language, and so does each case's AI report, so a reviewer who
cannot read it can choose another case.

Ideas are `app/ideas/`: your own at `/en/ideas/mine`, and the composer at `/en/ideas/compose`
(new) or `/en/ideas/compose?id=` (existing). The form keeps what everyone sees (title, summary)
apart from the private brief, saves only the fields that changed, and asks before publishing or
closing (`ConfirmDialog` in `app/confirm-dialog.tsx`, for anything that cannot be undone). The
app keeps pages in memory between visits, so a form is keyed by the id in its address.
Open ideas are at `/en/ideas`, and one idea's public page at `/en/ideas/view?id=`: the public
part only, a "Needs your role" line when a role slug matches, and "Ask to join" when the idea
has a hub (`hubs/ask-to-join.tsx`, `POST /v1/hubs/{id}/join-requests`). The page reads the
hub's card to know whether the viewer already asked, is invited or is a member. The owner
answers in the hub's team list with Approve or Decline; approving makes it an invitation, signed
on the join page. "Your hubs" lists a developer's own requests under "Waiting for the owner".
A developer can take a waiting request back on the idea's page or the hub's page
(`hubs/withdraw-request.tsx`, `POST /v1/hubs/{id}/join-request/withdraw`).
After a decline the developer waits before asking again: the date the wait ends replaces the
button, read from the hub's card (`viewer.can_ask_again_at`) or from a press that was too soon
(409 `REQUEST_COOLING_DOWN`).

"For you" at `/en/ideas/for-you` is the third ideas tab: the open ideas that need a role the
developer is verified in (`GET /v1/me/matches`), each with the roles that matched. Matching goes
by verified roles, so a developer without one is sent to verify, and the page does not call the
API for them.

The owner's side is `/en/ideas/matches?id=`: developers verified in a role the idea needs
(`GET /v1/me/ideas/{id}/matches`), each with the roles that matched and the technologies shared
with the owner. With a hub, "Invite to the hub" sends the invitation from the row
(`inviteMember`, the same call and refusal sentences as the hub's invite form); without one the
page says a hub comes first. "See who matches" on Your ideas and a link under the hub's invite
form lead here.

Hubs are `app/hubs/`: create one from an open idea at `/en/hubs/new?idea=` (name, terms, the
agreement as the server sends it, a typed legal name, then a confirm dialog), one hub at
`/en/hubs/view?id=`, and your hubs at `/en/hubs`. The request carries the agreement's id and hash
that were shown; if the API says the agreement changed, the page shows the new text and asks
again. The agreement's Markdown is rendered by `agreement-text.tsx` as headings, lists and
paragraphs only, never as markup.

The hub page shows a member the team (`GET /v1/hubs/{id}/members`) and the private brief
(`GET /v1/hubs/{id}/idea`). The owner invites by GitHub username, withdraws an invitation and
invites again after a decline (`team.tsx`); an invited developer sees the invitation, not the
team's brief. Your hubs lists waiting invitations first (`GET /v1/me/hubs?status=invited`).
The village and Your hubs keep that list for the visit (`app/hubs/invitations.ts`): the village
makes a waiting invitation its next step, and the places bar marks Hubs with a dot. Signing or
declining takes the invitation off the list. A page that needs the hub of an idea reads every
page of the developer's hubs (`loadHubsByIdea`), because the API cannot look one up by idea.

An invited developer joins at `/en/hubs/join?id=`: the hub's terms, the hub's own agreement
(`GET /v1/hubs/{id}/agreement`), the read box, a typed legal name and a confirm dialog. It shares
the agreement block and the signature checks with the create-hub page (`agreement-block.tsx`),
and sends the id and hash of the text that was shown.

The Developer Exchange is `app/feed/`. The feed is a place in the navigation, at `/en/feed`,
with three tabs: For you (`GET /v1/feed`), Saved (`GET /v1/me/saved-posts`) and Yours
(`GET /v1/posts?author=`). A post's body is shown as plain text, never as markup. Like and Save
change the screen at once and send the request after; a failure puts the button back and says
so (`feed-api.ts`, `post-card.tsx`).

One post is at `/en/posts/view?id=`, and the navigation marks Feed there (`AppFrame` treats
`posts` as part of the feed). Its author can delete it, after a confirm dialog, and lands on
Yours with "Post deleted". A post that is gone, or an id that is not one, gets its own screen.

A post is written at `/en/posts/compose` and edited at `/en/posts/compose?id=` (its author
only), in `post-composer.tsx`: the kind of post, a title (required for an RFC), the text, a
link and up to five topics. The kind and the topics cannot change after posting, because the
API's `PATCH` takes only the title, the text and the link; an edit sends only what changed. It
shares its field and its leave warning with the idea composer.

The For you tab says what it shows and lets the developer change it in place
(`feed-topics.tsx`): the chosen technologies are saved with `PUT /v1/me/feed-topics` (the
request key is `technologies`), kept in the profile, and the feed loads again. None chosen
means every post. Onboarding's topics step is not saved here: it asks about sectors, which the
API does not know.

Comments are a section of the post page (`comments.tsx`, `comment.tsx`, `comment-form.tsx`),
loaded after the post, at `#comments`. The list gives each top-level comment its first two
replies; "Show all N replies" loads the rest, and a reply's own replies open the same way, one
level at a time (`GET /v1/comments/{id}/replies`). Indent stops at the third level. A deleted
comment that still has replies is drawn as a placeholder with its replies under it. Comments
are plain text. A comment is liked like a post: the screen changes at once and the request
follows (`PUT` and `DELETE /v1/comments/{id}/like`).

The profile is `app/profile/`, at `/en/profile`: the name and bio (`PATCH /v1/me`), the roles
(add, make main, remove; the page loads the profile again after each) and the stack
(`PUT /v1/me/technologies`), then the language and sign out. A developer with no role is sent to
onboarding first. The village's "Edit my profile" link opens it.

"Try the demo" on the landing page (`landing/demo-button.tsx`, `session/demo.ts`) signs in as the
shared demo account with `POST /v1/auth/demo` and opens the village. The account can change
nothing: the API answers every change with 403 `DEMO_READ_ONLY`. `apiFetch` notices that
answer for every screen, and `AppFrame` shows the demo account a line under the header that
says what the demo is, says so when a change was refused, and offers the way out.

The guided tour starts from the demo line's "Take the tour" (`app/tour/`): a start on the
village, then four stops on the demo account's own open idea and hub (the composer, the matches,
the hub's team, the hub's phases). `AppFrame` shows the tour's panel under the demo line; it
sticks to the top of the screen, shrinks to one line on a screen that is not the stop, and keeps
its step in `sessionStorage` (`tour/tour.ts`). A stop can name a part of a screen with a hash:
the hub page scrolls to `#team` or `#phases` once the hub has loaded (`app/scroll.ts`).

Sign-in starts at `/{lang}/sign-in` (`app/sign-in/`) and finishes at `/{lang}/auth/callback`
(`app/auth-callback/`), which keeps the tokens and opens onboarding in the language sign-in
started in. `app/session/` holds the rest: `useSession()` tells a page whether someone is
signed in, `apiFetch()` calls the API with the access token and refreshes it when it expires,
`signOut()` forgets the session and revokes it, and `RequireSession` sends signed-out visitors
to sign-in. Only the tokens are stored; pages read the profile from `GET /v1/me`. Style pages only with the design system tokens, imported in
`app/globals.css` from [`docs/design-system/`](../../docs/design-system/README.md), and use
`Logo` from `app/logo.tsx` for the logo and `Tooltip` from `app/tooltip.tsx` for icon buttons. See the root [CONTRIBUTING.md](../../CONTRIBUTING.md) for the team workflow.

An address that matches no page gets `app/global-not-found.tsx`: real HTML with a 404 status
(`experimental.globalNotFound` in `next.config.ts`). Next builds that document once for every
address, so it holds the page in each language, and a script that runs before first paint
reads the language from the address; `globals.css` shows the matching one. An address typed
without a language, like `/ideas`, is first sent to the visitor's language by `proxy.ts`
(`/en/ideas` or `/fr/ideas`), so it reaches the real page, or this document if there is none.
`app/[lang]/not-found.tsx` draws the same page for anything that still calls `notFound()`.
Both use `app/page-not-found/`: the
message, the address asked for, the ways back (`ways-out.tsx`) and the small scene
(`gathering.tsx`). Why: `docs/decisions/2026-11-13-not-found-page.md`.
