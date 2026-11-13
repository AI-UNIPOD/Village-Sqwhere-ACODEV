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
