# Dashseller Knowledge Base (SellerHunt / Explorer)

Code-facing orientation: app topology, auth wiring, data-access patterns, DB
workflow. Non-obvious things you can't learn from `git log`.

This repo is the **Explorer** stack split out of the original dashseller. It
does competitor-listing scanning and product research over *unofficial*
marketplace data. The multichannel-management half (orders, listings sync,
shipments, inventory, channels, organizations, the BullMQ sync worker, the
official-marketplace adapters, the marketing site) was removed in the split.

---

## App topology

Two apps, one shared backend:

- **`apps/api`** (Hono) — the only backend. Hosts tRPC and better-auth routes.
  Mounts: `/api/auth`, `/trpc`, `/health`.
- **`apps/app`** (Next.js, App Router) — authenticated dashboard. The signed-in
  landing is `/explorer/listings`; settings under `/settings/{account,security,appearance}`.
  Talks to `apps/api` via the tRPC client in `apps/app/src/lib/utils/trpc/client.tsx`
  (`httpBatchLink`, `credentials: "include"`, superjson).

The scan pipeline that fills the explorer's data (`apps/trigger-scan`) runs
autonomously on self-hosted Trigger.dev — the apps never trigger it.

---

## Auth model

- Library: **better-auth** (PostgreSQL adapter via drizzle), config in
  `packages/auth/src/auth-server.ts`, client in `apps/app/src/lib/auth-client.ts`.
- Email/password + social OAuth (Google, Discord); email verification required
  on signup; email-OTP for verification / password-reset / change-email; passkey
  and TOTP two-factor.
- **No organizations / tenancy.** The organization plugin and per-org isolation
  were removed. Auth is user + session only (`user`, `session`, `account`,
  `verification`, `passkey`, `two_factor` tables). Kept for a future
  subscription/paywall, not for multi-tenant scoping.
- Session shape accessed via `authServer.api.getSession()` in
  `packages/trpc/src/context.ts`. Context creation is framework-agnostic — the
  same `createContext(headers, getSession)` is used by Hono (raw headers) and
  can be reused elsewhere.

---

## tRPC

`packages/trpc` exposes `router`, `publicProcedure`, `protectedProcedure`
(session-gated) from `index.ts`. `routers/index.ts` aggregates `appRouter`,
which today is `{ healthCheck, scanListing }`. The `scanListing` router is
**public** (`publicProcedure`) — the explorer reads scan data without a session.

Query builders shared by routers live in `packages/trpc/src/lib/`
(`build-filter`, `build-group`, `build-rollup`, `build-search`, `build-sort`,
`schemas`), with `bun:test` coverage in `lib/__tests__/`.

### tRPC + React Query patterns

**Page-level data:** `useQuery`. **Inside dataview tables:** `useSuspenseQuery`
— the Suspense boundary keeps the previous page mounted while the next loads.
Don't flip these: `useSuspenseQuery` at the page level kills the loading
skeleton; `useQuery` in dataview flickers between pages.

---

## Dataview package

`@sparkyidea/dataview` is **not** a thin wrapper around `@tanstack/react-table`.
It's a query+display abstraction: filtering (`WhereNode` schema in
`validators/`), cursor-based pagination, grouping, rollups — tightly coupled to
tRPC router inputs (routers consume dataview validators directly). Add new table
views by following `packages/dataview/src/components/views/`, not raw
`@tanstack/react-table`.

---

## The scan pipeline (Trigger.dev, self-hosted)

- **`@dashseller/marketplace-scan`** (`packages/marketplace-scan/`) — the
  unofficial scraping adapters (eBay, shop) that read *other people's* public
  listings. Read-only research data; no seller credentials. Exports
  `createScanClient` / `getScanToken`; types at `/types`, errors at `/errors`.
- **`@dashseller/trigger-scan`** (`apps/trigger-scan/`) — the scan jobs that
  drive the adapters and write `scan_*` rows. Deploys to the **self-hosted**
  Trigger.dev at `https://trigger.sparkyidea.com`. Deliberately tiny secret
  surface (`DATABASE_URL` + `ENCRYPTION_SECRET` only). Runs on cron; the app
  never triggers it. `utils/mobile-profile-manager.ts` owns the `mobile_profile`
  persona pool and mints/caches bearers; secret crypto is `utils/secret-crypto.ts`.

Deploy via root scripts `trigger-scan:dev` / `trigger-scan:deploy` (they pass
`-a https://trigger.sparkyidea.com --profile sparkyidea`; run
`trigger login -a https://trigger.sparkyidea.com --profile sparkyidea` once).

---

## Database operations

**Never run `drizzle-kit push` or `drizzle-kit migrate` without explicit user
approval.**

Workflow:

1. Edit `packages/db/src/schema/*.ts` (kept schema: `auth`, `mobile-profile`,
   `scan`).
2. Run `bun db:generate` to produce a migration file in `src/migrations/`.
3. **Stop.** Show the migration to the user. Let the user apply it.

`drizzle.config.ts` reads `DATABASE_URL` from `apps/api/.env`. The env-free
client factory (`@dashseller/db/client`) is used by integration tests
(`testing.ts` → `migrateTestDb`); the package root (`@dashseller/db`) is the
env-validated singleton.

---

## Notifications

`apps/app/src/components/navigation/notification-dropdown.tsx` is a **static
demo** — no backend wiring. Treat it as a UX prototype.

---

## Stack snapshot

- **Runtime:** Bun (workspaces + version catalog). **Build:** Turborepo.
- **Frontend:** Next.js 16, React 19, Tailwind 4, shadcn primitives, Tiptap v3,
  tRPC v11, Tanstack Query v5.
- **Backend:** Hono v4, better-auth v1.7, drizzle-orm v0.45, postgres.
- **Jobs:** Trigger.dev v4.4 (self-hosted, scan only).
- **Validation:** Zod v4, T3 env. **Linting:** Ultracite (Biome preset).
