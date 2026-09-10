---
title: Where Things Live
impact: HIGH
tags: [reference, navigation]
---

## File Locations

**Impact: HIGH**

Lookup table for the (Explorer-only) dashseller monorepo. Update when packages
move.

### Apps

| App                 | Path                 | Purpose                                                              |
| ------------------- | -------------------- | -------------------------------------------------------------------- |
| `apps/api`          | Hono backend         | Only backend. Mounts `/api/auth` (better-auth), `/trpc`, `/health`.  |
| `apps/app`          | Next.js (App Router) | Authenticated dashboard — `/explorer/listings`, `/settings/*`.       |
| `apps/trigger-scan` | Trigger.dev worker   | Standalone deploy target (`@dashseller/trigger-scan`), self-hosted at `https://trigger.sparkyidea.com`. Nothing imports it — cron-driven. `src/workflows/scan/`, `nodes/scan/`, `keywords/` (OpenAI keyword extraction: prompt + schema, pure LLM stage, client), `scripts/try-keywords.ts` (`keywords:try` prompt tryout), `utils/` (`mobile-profile-manager.ts`, `secret-crypto.ts`). |

### Packages

| Package                       | Path                          | Purpose                                                                                          |
| ----------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `@dashseller/trpc`            | `packages/trpc/src/`          | tRPC routers (`routers/`), `context.ts`, `index.ts` exports `router`/`publicProcedure`/`protectedProcedure`. `appRouter` in `routers/index.ts` = `{ healthCheck, scanListing }`. Query builders in `lib/`. |
| `@dashseller/auth`            | `packages/auth/src/`          | better-auth server config (`auth-server.ts`), UI components (`components/`), plugins (`lib/auth/`). No organization plugin. |
| `@dashseller/db`              | `packages/db/src/`            | Drizzle schema (`schema/{auth,mobile-profile,scan}.ts`; `scan_keyword` doubles as the LLM-learned keyword pool, `scan_listing.keyword_id` links listings), migrations (`migrations/`), client (`index.ts`, `client.ts`), seeds (`seed/{scan,mobile-profile}.ts`). |
| `@sparkyidea/dataview`        | `packages/dataview/src/`      | Filtering / pagination / grouping abstraction. `components/{views,toolbars,skeletons,ui}`, `hooks/`, `parsers/`, `validators/`, `types/`. |
| `@sparkyidea/ui`              | `packages/ui/src/`            | shadcn-based primitives (`components/`), icons, `lib/utils.ts` (`cn`), styles.                   |
| `@dashseller/env`             | `packages/env/src/`           | T3 env validation. Per-target files: `app.ts`, `server.ts`, `db.ts`, `trigger-scan.ts`.         |
| `@dashseller/marketplace-scan`| `packages/marketplace-scan/src/` | Unofficial scraping adapters (eBay, shop) for read-only research data. `index.ts` exports `createScanClient`/`getScanToken`; `/types`, `/errors`. |
| `@dashseller/config`          | `packages/config/`            | Shared TS / build config.                                                                        |

> The scan worker lives in **`apps/`** (`apps/trigger-scan`), not here — it's a deploy target, not a consumed library. See the Apps table above.

### Routes

- `apps/app/src/app/(app)/` — authenticated dashboard routes: `explorer/listings`
  (+ `[listingId]`), `settings/{account,security,appearance}`. `(app)/page.tsx`
  redirects to `/explorer/listings`.
- `apps/app/src/app/auth/[path]/` — login / signup / verification.

### tRPC routers (in `packages/trpc/src/routers/`)

- `scan-listing` — the explorer's read API (`get`, `getMany`, `getGroup`), all `publicProcedure`.

### Trigger.dev scan workflows (in `apps/trigger-scan/src/workflows/`)

- `scan/scan-crons.ts` — one scheduled task sweeping listings, sellers, and keywords across enabled marketplaces.
- `scan/scan-listings-by-{ids,keyword,seller}.ts` — listing discovery phases.
- `scan/resolve-listing-keywords.ts` — manual retry tool for keyword extraction (the `scan-listings-by-ids` leaf extracts inline).

### Notable client setup

- tRPC React client: `apps/app/src/lib/utils/trpc/client.tsx` — `useTRPC` hook, `httpBatchLink`, superjson, `credentials: "include"`.
- Auth client: `apps/app/src/lib/auth-client.ts`.

### Generated / off-limits paths

Regenerate, never hand-edit:

- `packages/db/src/migrations/` — drizzle-kit output.
- `packages/db/drizzle.config.ts` reads `DATABASE_URL` from `apps/api/.env`.
- `.next/`, `dist/`, `build/`, `*.tsbuildinfo`.
- tRPC `AppRouter` type (inferred) — change procedures, the type follows.
