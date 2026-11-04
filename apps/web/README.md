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
Pages live in `app/`. See the root [CONTRIBUTING.md](../../CONTRIBUTING.md) for the team workflow.
