# dashseller (SellerHunt / Explorer)

The **Explorer** stack split out of the original dashseller: competitor-listing
scanning and product research over *unofficial* marketplace data. There is no
official-marketplace integration here — orders, listings sync, shipments,
inventory, channels, and organizations were removed in the split. (Package
scopes stay `@dashseller/*` until the sellerhunt rename, a separate task.)

## Stack

- **TypeScript** + **Bun** + **Turborepo** monorepo
- **Next.js** — the dashboard app (`apps/app`)
- **Hono** + **tRPC** — the API (`apps/api`)
- **Drizzle** + **PostgreSQL** — database (`packages/db`)
- **Better-Auth** — user authentication (no organizations/tenancy)
- **Trigger.dev** (self-hosted) — the scan ingestion pipeline (`apps/trigger-scan`)
- **shadcn/ui** — shared primitives in `packages/ui`
- **Husky** — git hooks for code quality

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Local services (Postgres)

Local development runs against a Docker-hosted Postgres defined in
`docker-compose.dev.yml` (persistent named volume — unlike the ephemeral
`docker-compose.test.yml`, which belongs to the integration tests; the two
stacks use distinct ports and can run side by side).

```bash
bun docker:up    # Postgres on localhost:54320
```

The env files point at it by default:

- `apps/api/.env` — `DATABASE_URL`. drizzle-kit reads this file too, so
  `db:generate` / `db:migrate` / `db:studio` follow it.

Seed the database one of two ways:

```bash
bun db:clone     # exact copy of a remote DB (schema + data) — prompts
                 # for the remote URL; or pass it as an argument
bun db:migrate   # or: start empty and apply migrations
```

`bun docker:down` stops the container and keeps the data. Full
reset: `docker compose -f docker-compose.dev.yml down -v`.

The scan pipeline (`apps/trigger-scan`) runs on a self-hosted Trigger.dev
instance and populates the scan tables autonomously on cron — the app never
triggers it. `apps/trigger-scan/.env` points at the deployed DB, not your
laptop.

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3002](http://localhost:3002) in your browser to see the
dashboard. The API is running at [http://localhost:3000](http://localhost:3000).

## UI Customization

The dashboard shares shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json`

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

If you want to add app-specific blocks instead of shared primitives, run the
shadcn CLI from `apps/app`.

## Git Hooks and Formatting

- Initialize hooks: `bun run prepare`

## Project Structure

```
dashseller/
├── apps/
│   ├── app/                  # Dashboard (Next.js) — /explorer/listings
│   ├── api/                  # Backend (Hono, tRPC, Better-Auth)
│   └── trigger-scan/         # Trigger.dev scan pipeline (self-hosted)
├── packages/
│   ├── auth/                 # Better-Auth config + auth UI
│   ├── dataview/             # Domain query + display abstraction
│   ├── db/                   # Drizzle schema, migrations, seeds
│   ├── env/                  # Per-surface T3 env schemas
│   ├── marketplace-scan/     # Unofficial scraping adapters (eBay, shop)
│   ├── trpc/                 # tRPC appRouter + dataview query builders
│   └── ui/                   # Shared shadcn/ui components and styles
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun x turbo -F <app> dev`: Start a single app (app, api)
- `bun run check-types`: Check TypeScript types across all apps
- `bun run check` / `bun run fix`: Lint + format (ultracite)
- `bun run test`: Unit tests
- `bun db:generate`: Generate a migration from schema changes
- `bun db:migrate`: Run database migrations
- `bun db:studio`: Open database studio UI
- `bun trigger-scan:dev` / `bun trigger-scan:deploy`: Run / deploy the scan pipeline
