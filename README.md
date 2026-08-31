# Ernest

Ernest is the foundation for an AI-powered boat and RV asset manager. The product will organize an owner's asset data and private documentation so that future AI answers can be specific, useful, and grounded in the owner's records.

This repository currently contains only the deployable application shell. Authentication, persistence, file uploads, AI integrations, retrieval, and local agents are intentionally out of scope for this phase. See [PRODUCT.md](./PRODUCT.md) for the MVP and [ARCHITECTURE.md](./ARCHITECTURE.md) for the planned system design.

## Tech stack

- Next.js App Router
- React
- TypeScript with strict type checking
- ESLint
- Vercel-compatible build and runtime conventions

The planned services—PostgreSQL/Neon, Cloudflare R2, and a hosted AI API—are documented but not connected.

## Local development

Requirements:

- Node.js 20.9 or newer
- npm

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No environment values are required for the starter page.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Deploy to Vercel

Import the Git repository into Vercel and use the detected Next.js defaults. The current shell needs no environment variables. Add secrets through Vercel's environment settings only when the corresponding integration is implemented; never commit `.env.local`.

## Repository layout

```text
src/app/          Next.js application shell
PRODUCT.md        MVP scope and product principles
ARCHITECTURE.md   Planned boundaries and evolution
.env.example      Future configuration names, without secrets
```
