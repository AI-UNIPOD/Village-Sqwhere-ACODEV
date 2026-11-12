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
`app/onboarding/` (at `/en/onboarding`). Style pages only with the design system tokens, imported in
`app/globals.css` from [`docs/design-system/`](../../docs/design-system/README.md), and use
`Logo` from `app/logo.tsx` for the logo. See the root [CONTRIBUTING.md](../../CONTRIBUTING.md) for the team workflow.

An address that matches no page shows a not-found page in the address's language:
`app/[lang]/[...rest]` calls `notFound()` and `app/[lang]/not-found.tsx` renders it. An unknown
language, like `/xx/page`, gets the English version: every page under `[lang]` calls `notFound()`
for a language it does not know, and the root layout falls back to English. `global-not-found.tsx`
is not used, because `[lang]/[...rest]` matches every address, so no address is left unmatched.
Both use `app/page-not-found/`.
