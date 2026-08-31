# Dashseller Knowledge Base

Code-facing orientation: app topology, auth wiring, data-access patterns, DB
workflow. Non-obvious things you can't learn from `git log`.

> **Product and domain knowledge lives in [`../.domain/`](../.domain/), not here.**
> What the product *is*, what entities mean, why we chose what we chose, and how
> each marketplace actually behaves. Start at
> [`../.domain/README.md`](../.domain/README.md) and
> [`../.domain/glossary.md`](../.domain/glossary.md).
>
> One fact, one home — if you're about to write a product fact here, it belongs
> there instead.

---

## Product

See [`../.domain/product.md`](../.domain/product.md) — what
dashseller is, the four core jobs, and the three constraints that shape most
decisions.

The repo was previously `dashseller-saas`; it is now `dashseller`.

---

## App topology

Three apps, one shared backend:

- **`apps/api`** (Hono) — the only backend. Hosts tRPC, better-auth routes, OAuth callbacks for marketplace integrations, file uploads.
- **`apps/app`** (Next.js) — authenticated dashboard. Talks to `apps/api` via tRPC.
- **`apps/web`** (Next.js) — public marketing site. Standalone; no auth.

Both Next.js apps consume `apps/api` via the tRPC client setup in `apps/app/src/lib/utils/trpc/client.tsx`. Session is hydrated through `httpBatchLink` with `credentials: "include"`.

---

## Auth model

- Library: **better-auth** (PostgreSQL adapter via drizzle).
- Email/password + social OAuth (Google, Discord).
- Email verification required on signup.
- Session shape: `{ user: { id, ... } }` — accessed via `auth.api.getSession()` in `packages/trpc/src/context.ts`.
- Authorization model is **per-organization isolation by `organizationId`** — the organization is the tenant.
  One org is auto-created per user at signup; `orgProcedure` enforces the scope. `createdByUserId` is
  attribution only, never isolation. (Business data was `userId`-scoped before the org migration.)

Context creation is framework-agnostic — the same `createContext` is used by Hono (raw headers) and by Next.js (`headers()`).

---

## tRPC + React Query patterns

**Page-level data:** `useQuery`. Use this for the initial fetch on a route.

**Inside dataview tables:** `useSuspenseQuery`. The Suspense boundary keeps pagination smooth — the previous page stays mounted while the next loads. (See memory: `feedback_usequery_over_suspensequery`.)

Don't flip these. `useSuspenseQuery` at the page level kills the loading skeleton; `useQuery` in dataview causes flicker between pages.

---

## Dataview package

`@dashseller/dataview` is **not** a thin wrapper around `@tanstack/react-table`. It's a domain-specific query+display abstraction:

- Filtering (`WhereNode` schema in `validators/`).
- Cursor-based pagination.
- Grouping, rollups.
- Tightly coupled to tRPC router inputs — routers consume dataview validators directly.

When adding a new table view, follow existing patterns in `packages/dataview/src/components/views/` rather than reaching for raw `@tanstack/react-table`.

---

## Background work (BullMQ worker + Trigger.dev)

Marketplace sync (orders/listings/shipments/channels + the outbox) runs on
**BullMQ in `apps/worker`**: domain cores live in `packages/sync` (pure,
env-free, everything injected via `SyncContext`), typed job contracts in
`packages/job-client` (tRPC producers enqueue via `ctx.jobs`), and the
webhook receiver is served by the worker itself. Queues, schedulers, alert
queries, and runbooks: `apps/worker/OPERATIONS.md`.

Two independently-deployed Trigger.dev packages remain:

- **`@dashseller/trigger-sync`** (`packages/trigger-sync/`) — carrier tracking only: the `poll-tracking` cron + reusable `poll-trackings` task. Deploys to **Trigger.dev Cloud** (`proj_vwdtyixntworrzcxrvwl`). Secret surface: db + geo + the Ship24 credential.
- **`@dashseller/trigger-scan`** (`packages/trigger-scan/`) — marketplace scraping/scan. Deploys to the **self-hosted** instance at `https://trigger.sparkyidea.com` (`proj_jtxdtdkuxfpuykkwwtxe`). Deliberately tiny secret surface (`DATABASE_URL` + `ENCRYPTION_SECRET` only). Runs autonomously on cron — the app never triggers it.

The two share no code; each has its own `trigger.config.ts`, env schema (`@dashseller/env/trigger-sync` / `@dashseller/env/trigger-scan`), and `.env`. Deploy via root scripts `trigger-sync:deploy` / `trigger-scan:deploy` (the scan script passes `-a https://trigger.sparkyidea.com --profile sparkyidea`; run `trigger login -a https://trigger.sparkyidea.com --profile sparkyidea` once on the self-hosted target).

### Sync state & outbox

Per-(channel, domain) sync progress lives in `channel_sync_state`
(watermark `syncedAt`, `status`/`error`, `lastRunAt`) — the old
`channel.{syncedAt,syncStatus,syncError}` triple is gone.

**Outbox** — `sync_outbox` table is the durable record of every local mutation that needs to propagate to a marketplace. Each row walks a state machine (`pending → claimed → reconciling → sending → awaiting_confirmation → confirmed`, with `failed`/`conflict`/`canceled`/`reconciliation_required` branches). The pull-side reads in-flight rows to avoid stomping on local edits during a marketplace fetch. Lifecycle schedulers (`drain-sync-outbox`, `dispatch-outbox-recovery`, `outbox-stale-reset`, `outbox-sending-sweep`, `outbox-conflict-escalation`, `outbox-cleanup`) run on the worker's `sync-control` queue.

For the full pattern (schema, four-piece push/fingerprint/protection/confirmation, worked example, extension checklist, pitfalls), see [`../.domain/sync/outbox.md`](../.domain/sync/outbox.md).

---

## Database operations

**Never run `drizzle-kit push` or `drizzle-kit migrate` without explicit user approval.** (See memory: `feedback_no_db_commands`.)

Workflow:

1. Edit `packages/db/src/schema/*.ts`.
2. Run `bun db:generate` to produce a migration file.
3. **Stop.** Show the migration to the user. Let the user apply it.

`drizzle.config.ts` reads `DATABASE_URL` from `apps/api/.env`.

---

## Marketplace adapters

`packages/marketplace/src/` exposes two factories:

- `createAuthClient(channel)` — for OAuth flows.
- `createApiClient(channel, credentials)` — for live API calls.

`adapters/ebay/` and `adapters/shopify/` are the only implementations. Amazon is a `MarketplaceType` union member with no adapter directory — do not assume any code path exists for it.

Per-marketplace external behaviour (scope migrations, webhook quirks, API gaps) lives in [`../.domain/channels/`](../.domain/channels/).

---

## Notifications & channels (UI-only today)

`apps/app/src/components/notification-dropdown.tsx` is currently a **static demo** — color-coded items, icons, descriptions, timestamps, but no backend wiring. Treat it as a UX prototype until a sync/notification model lands.

---

## Stack snapshot

- **Runtime:** Bun (workspaces + version catalog).
- **Build:** Turborepo.
- **Frontend:** Next.js 16, React 19, Tailwind 4, shadcn primitives, Tiptap v3 (rich text), tRPC v11, Tanstack Query v5.
- **Backend:** Hono v4, better-auth v1.5, drizzle-orm v0.45, postgres.
- **Jobs:** Trigger.dev v4.4.
- **Validation:** Zod v4, T3 env.
- **Linting:** Ultracite (Biome preset).
