# Ernest

Ernest is the foundation for an AI-powered boat and RV asset manager. The product will organize an owner's asset data and private documentation so that future AI answers can be specific, useful, and grounded in the owner's records.

The application persists its asset inventory in PostgreSQL. Authentication, file uploads, AI integrations, retrieval, and local agents remain intentionally out of scope. See [PRODUCT.md](./PRODUCT.md) for the MVP and [ARCHITECTURE.md](./ARCHITECTURE.md) for the system design.

## Tech stack

- Next.js App Router
- React
- TypeScript with strict type checking
- ESLint
- PostgreSQL via the lightweight `postgres` driver (compatible with Neon)
- Vercel-compatible build and runtime conventions

## Local development

Requirements:

- Node.js 20.9 or newer
- npm
- PostgreSQL (local or Neon)

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run db:seed
npm run dev
```

Set `DATABASE_URL` in `.env.local` or your shell before running database commands and the app. Next.js loads `.env.local`; standalone Node scripts require it to be exported (for example, `set -a; source .env.local; set +a`). `DATABASE_URL` is server-only and must never use a `NEXT_PUBLIC_` prefix.

## Database setup and changes

Migrations are ordered SQL files in `migrations/`. The migration runner records each applied file in `schema_migrations` and runs new files transactionally. The seed is idempotent and populates the Far Better asset with its Electrical, Fresh Water, and Propulsion inventory.

```bash
# With DATABASE_URL exported in this shell:
npm run db:migrate
npm run db:seed
```

Apply those commands deliberately to each environment. They are **not** run automatically during builds or application startup. Do not point local tooling at a live database unless you intend to modify it, and never commit a connection string.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Deploy to Vercel

Import the Git repository into Vercel and use the detected Next.js defaults. Add `DATABASE_URL` through Vercel's environment settings, then apply migrations and the seed from a trusted administrative environment. Never commit `.env.local` or database credentials.

## Repository layout

```text
src/app/          Next.js application shell
src/domain/       Provider-independent domain types
src/data/         Repository boundary and PostgreSQL adapter
migrations/       Version-controlled PostgreSQL schema changes
scripts/          Explicit migration and seed tooling
PRODUCT.md        MVP scope and product principles
ARCHITECTURE.md   Planned boundaries and evolution
.env.example      Future configuration names, without secrets
```
