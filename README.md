# dashseller

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines Next.js, Hono, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **tRPC** - End-to-end type-safe APIs
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Husky** - Git hooks for code quality
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Local services (Postgres + Redis)

Local development runs against Docker-hosted Postgres and Redis defined in
`docker-compose.dev.yml` (persistent named volumes — unlike the ephemeral
`docker-compose.test.yml`, which belongs to the integration tests; the two
stacks use distinct ports and can run side by side).

```bash
bun docker:up    # Postgres on localhost:54320, Redis on localhost:63790
```

The env files point at these by default:

- `apps/api/.env` — `DATABASE_URL`, `REDIS_QUEUE_URL`. drizzle-kit reads
  this file too, so `db:generate` / `db:migrate` / `db:studio` follow it.
- `apps/worker/.env` — `DATABASE_URL`, `REDIS_QUEUE_URL`.

Seed the database one of two ways:

```bash
bun db:clone     # exact copy of a remote DB (schema + data) — prompts
                 # for the remote URL; or pass it as an argument
bun db:migrate   # or: start empty and apply migrations
```

`bun docker:down` stops the containers and keeps the data. Full
reset: `docker compose -f docker-compose.dev.yml down -v`.

Deployed services keep their own URLs: Dokploy apps use internal Docker
hostnames, and `packages/trigger-sync/.env` intentionally stays on the
remote dev DB (its tasks run on the Trigger.dev worker, not your laptop).

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@sparkyidea/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Git Hooks and Formatting

- Initialize hooks: `bun run prepare`

## Project Structure

```
dashseller/
├── apps/
│   ├── web/         # Frontend application (Next.js)
│   └── server/      # Backend API (Hono, TRPC)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun x turbo -F <app> dev`: Start a single app (web, app, api, worker)
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
