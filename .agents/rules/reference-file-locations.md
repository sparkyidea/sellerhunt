---
title: Where Things Live
impact: HIGH
tags: [reference, navigation]
---

## File Locations

**Impact: HIGH**

Lookup table for the dashseller monorepo. Update when packages move.

### Apps

| App           | Path                          | Purpose                                                              |
| ------------- | ----------------------------- | -------------------------------------------------------------------- |
| `apps/api`    | Hono backend                  | tRPC, better-auth routes, OAuth callbacks, uploads. Registers marketplace webhook subscriptions (delivery goes to the worker). Mounts: `/api/auth`, `/api/uploads`, `/trpc`, `/health`, `/oauth`. |
| `apps/app`    | Next.js (App Router)          | Authenticated SPA dashboard — products, listings, orders, shipments, settings. |
| `apps/web`    | Next.js (App Router)          | Public marketing site (about, pricing, landing).                     |
| `apps/worker` | Bun BullMQ worker             | Marketplace-sync consumers (five queues) + schedulers/outbox control plane + the PUBLIC webhook receiver. Endpoints: `/health`, `/ready`, `/stats`, `/webhook/:marketplace`. Tracking stays on Trigger.dev. Ops: `apps/worker/OPERATIONS.md`, cutover: `apps/worker/CUTOVER.md`. |

### Packages

| Package                | Path                              | Purpose                                                                                          |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `@dashseller/trpc`     | `packages/trpc/src/`              | tRPC routers (`routers/`), `context.ts`, `index.ts` exports `router`, `publicProcedure`, `protectedProcedure`. Aggregated in `routers/index.ts` as `appRouter`. |
| `@dashseller/auth`     | `packages/auth/src/`              | better-auth server config (`server.ts`), session helpers (`lib/`).                               |
| `@dashseller/db`       | `packages/db/src/`                | Drizzle schema (`schema/*.ts`), migrations (`migrations/`), client (`index.ts`).                 |
| `@dashseller/dataview` | `packages/dataview/src/`          | Filtering / pagination / grouping abstraction. `components/{views,toolbars,skeletons,ui}`, `hooks/`, `parsers/`, `validators/`, `types/`. |
| `@dashseller/ui`       | `packages/ui/src/`                | shadcn-based primitives (`components/`), icons, `lib/utils.ts` (`cn`), styles.                   |
| `@dashseller/env`      | `packages/env/src/`               | T3 env validation. Per-target files: `app.ts`, `server.ts`, `web.ts`, `db.ts`, `worker.ts`, `trigger-sync.ts`, `trigger-scan.ts`. |
| `@dashseller/sync`     | `packages/sync/src/`              | Env-free sync domain core (orders, listings, shipments, tracking, channels, outbox). All process concerns arrive via `SyncContext`. |
| `@dashseller/job-client` | `packages/job-client/src/`      | BullMQ contracts: queue topology, typed job payloads (zod), job-id/dedup rules, fail-fast producer (`createJobClient`). |
| `@dashseller/marketplace` | `packages/marketplace/src/`    | Marketplace adapters. `index.ts` exports `createAuthClient` / `createApiClient`. `adapters/ebay/` is the only impl today. |
| `@dashseller/taxonomy` | `packages/taxonomy/src/`          | Category tree. Single-file module loading from `data/categories/*.json`. Exports `getCategory`, `getCategoryTree`, `getTaxonomyVersion`. |
| `@dashseller/trigger-sync` | `packages/trigger-sync/src/`  | Trigger.dev **tracking** jobs (carrier tracking polls only — marketplace sync lives in `apps/worker`). Deploys to Trigger.dev Cloud (`proj_vwdtyixntworrzcxrvwl`). `workflows/` (`poll-tracking.ts`, `poll-trackings.ts`). |
| `@dashseller/trigger-scan` | `packages/trigger-scan/src/`  | Trigger.dev **scraping/scan** jobs. Deploys self-hosted at `https://trigger.sparkyidea.com` (`proj_jtxdtdkuxfpuykkwwtxe`). `workflows/{ebay,scan}/`, `nodes/scan/`, `utils/`. |
| `@dashseller/config`   | `packages/config/`                | Shared TS / build config.                                                                        |

### Routes

- `apps/web/src/app/` — public landing pages.
- `apps/app/src/app/(app)/` — authenticated dashboard routes (dashboard, products, listings, orders, shipments, issues, channels, settings, account, security, appearance).
- `apps/app/src/app/auth/[path]/` — login / signup / verification.

### tRPC routers (in `packages/trpc/src/routers/`)

`category`, `channel`, `issue`, `listing`, `marketplace`, `order`, `product`, `product-variant`, `shipment`, `stock`, `sync`, `context-search`.

### Trigger.dev tracking workflows (in `packages/trigger-sync/src/workflows/`)

- `poll-tracking.ts` — cron selecting due-for-poll tracks.
- `poll-trackings.ts` — reusable batch poll against Package Tracker (Ship24).

Marketplace sync (orders/listings/shipments/channels + outbox control
plane) runs on BullMQ in `apps/worker/src/` — processors in `processors/`,
schedulers/dispatchers in `control/`.

### Trigger.dev scan workflows (in `packages/trigger-scan/src/workflows/`)

- `ebay/ebay-listings-scanner.ts` — cron that fans out scan jobs.
- `scan/scan-listings-by-{ids,keywords,seller}.ts` — listing discovery phases.

### Notable client setup

- tRPC React client: `apps/app/src/lib/utils/trpc/client.tsx` — `useTRPC` hook, `httpBatchLink`, superjson, `credentials: "include"`.
- Notification dropdown (UI-only, no backend yet): `apps/app/src/components/notification-dropdown.tsx`.

### Generated / off-limits paths

These are generated — regenerate, never hand-edit:

- `packages/db/src/migrations/` — drizzle-kit output.
- `packages/db/drizzle.config.ts` reads `DATABASE_URL` from `apps/api/.env`.
- `.next/`, `dist/`, `build/`, `*.tsbuildinfo`.
- tRPC `AppRouter` type (inferred) — change procedures, the type follows.
