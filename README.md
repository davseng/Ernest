# Ernest

Ernest is the foundation for an AI-powered boat and RV asset manager. The product will organize an owner's asset data and private documentation so that future AI answers can be specific, useful, and grounded in the owner's records.

The application lets each owner create and manage a private asset, system, component, and operating-history record in PostgreSQL and uses passwordless email authentication. File uploads, AI integrations, retrieval, and local agents remain intentionally out of scope. See [PRODUCT.md](./PRODUCT.md) for the MVP, [ARCHITECTURE.md](./ARCHITECTURE.md) for the system design, and [AUTHENTICATION.md](./AUTHENTICATION.md) for the authentication decision.

## Tech stack

- Next.js App Router
- React
- TypeScript with strict type checking
- ESLint
- PostgreSQL via the lightweight `postgres` driver (compatible with Neon)
- Auth.js with its PostgreSQL adapter and Nodemailer/Brevo SMTP magic links
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

Set the values documented in `.env.example`. `AUTH_SECRET` signs authentication cookies. Either the standard Auth.js `EMAIL_SERVER` SMTP URL or the split `EMAIL_SERVER_*` variables configure Brevo's SMTP relay; `EMAIL_SERVER` takes precedence when both are present. `EMAIL_FROM` must use an authenticated sender on `sailfarbetter.com`. Port 587 uses STARTTLS. Next.js loads `.env.local`; standalone Node scripts require it to be exported (for example, `set -a; source .env.local; set +a`). These values are server-only and must never use a `NEXT_PUBLIC_` prefix.

## Database setup and changes

Migrations are ordered SQL files in `migrations/`. The migration runner records each applied file in `schema_migrations` and runs new files transactionally. Migration `003` adds the Auth.js tables and a required asset owner; migration `004` adds the surrogate account and session IDs returned by the PostgreSQL adapter while preserving the existing primary keys and auth data. Migration `005` adds the owner-scoped operating log, and migration `006` adds optional asset registration and component serial identifiers. The seed is idempotent and assigns the Far Better asset and its inventory to `SEED_OWNER_EMAIL`; use the same email when signing in.

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
npm test
npm run build
```

## Deploy to Vercel

Import the Git repository into Vercel and use the detected Next.js defaults. Add `DATABASE_URL`, `AUTH_SECRET`, `EMAIL_FROM`, and either `EMAIL_SERVER` or all four split `EMAIL_SERVER_*` values through Vercel's environment settings. Enable every required variable for both **Preview** and **Production**: Vercel does not automatically copy environment-scoped values between them, and a preview deployment without these values cannot send a sign-in link. Redeploy after changing environment variables. Apply migrations and the seed, with `SEED_OWNER_EMAIL` set, from a trusted administrative environment. Never commit `.env.local` or credentials. The SMTP user and password are Brevo SMTP credentials, not an interactive Brevo account password.

## Repository layout

```text
src/app/          Next.js application shell
src/domain/       Provider-independent domain types
src/data/         Repository boundary and PostgreSQL adapter
migrations/       Version-controlled PostgreSQL schema changes
scripts/          Explicit migration and seed tooling
PRODUCT.md        MVP scope and product principles
ARCHITECTURE.md   Planned boundaries and evolution
AUTHENTICATION.md Authentication provider decision and trade-offs
.env.example      Future configuration names, without secrets
```
