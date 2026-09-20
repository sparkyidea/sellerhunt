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

One Next.js app and a shared API:

- **`apps/api`** (Hono) — the backend. Hosts `/api/auth`, `/trpc`, and `/health`.
  CORS and better-auth `trustedOrigins` accept `APP_URL`.
- **`apps/app`** (Next.js, App Router) — user and admin UI in one deployment.
  `(app)` shares the shell for Explorer, settings and admin; `(app)/admin` holds
  `/admin/mobile-profiles` and `/admin/mobile-profiles/[profileId]`.
  `/admin` redirects to the profile list.
  `admin/layout.tsx` reads the session from the API and returns the general
  404 for signed-out, banned, or non-admin users. The proxy lets admin paths reach
  this gate instead of redirecting signed-out visitors to sign-in.
  Both areas share one shell and panel root but have separate sidebar lists.
  Settings belongs to the app area only. It remembers the page it was opened
  from in memory (pathname and filters) for the session; a reload or fresh tab
  closes settings to `/explorer/listings`.
  Active admins enter through “Admin dashboard” in the avatar menu; the regular sidebar has no
  admin entry. Inside admin, that avatar entry becomes “Back to app”. The admin
  sidebar defines its own Help link, has no Settings entry, and retains the Mode
  control.
  tRPC permissions enforce access to every profile operation.

The Next.js app talks to `apps/api` through the shared tRPC client
(`src/lib/utils/trpc/client.tsx`: `httpBatchLink`, `credentials: "include"`,
superjson). It holds only `NEXT_PUBLIC_*` env, with no DB access or auth secret.
Set `COOKIE_DOMAIN` when the app and API use separate subdomains.

The scan pipeline that fills the explorer's data (`apps/trigger-scan`) runs
autonomously on self-hosted Trigger.dev — the apps never trigger it.

---

## Auth model

- Library: **better-auth** (PostgreSQL adapter via drizzle), server config in
  `packages/auth/src/auth-server.ts`; the client plugin set is
  `packages/auth/src/auth-client.ts` (`buildAuthClient`), instantiated per app
  in `apps/app/src/lib/auth-client.ts` with the API URL.
- Roles and permissions: the better-auth `admin` plugin owns `user.role` /
  `user.banned`. `packages/auth/src/lib/auth/permissions.ts` defines the
  access control (`createAccessControl`): `statement` = better-auth's
  `user`/`session` statements + `mobileProfile: [read, create, update, delete]`;
  roles `admin` (everything) and `user` (nothing). Server mounts
  `admin({ ac, roles })`, `buildAuthClient` mounts `adminClient({ ac, roles })`.
  `hasPermission(role, permissions)` is the pure check behind tRPC
  `permissionProcedure`; `roles.ts` (`hasAdminRole`) answers only "is an admin
  at all" (admin route layout gate, `adminProcedure`). First admin is set by SQL
  (`UPDATE "user" SET role='admin' WHERE email=…`).
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
(session-gated), `adminProcedure` (session + any admin role, not banned) and
`permissionProcedure(permissions)` (session + access-control statement, not
banned) from `index.ts`. `routers/index.ts` aggregates `appRouter`, which today
is `{ healthCheck, scanListing, mobileProfile }`. The `scanListing` router is
**public** (`publicProcedure`) — the explorer reads scan data without a session.
`mobileProfile` procedures each name their verb:
`permissionProcedure({ mobileProfile: ["read" | "create" | "update" | "delete"] })`.

Query builders shared by routers live in `packages/trpc/src/lib/`
(`build-filter`, `build-group`, `build-rollup`, `build-search`, `build-sort`,
`schemas`), with `bun:test` coverage in `lib/__tests__/`.

### Panel lifecycle

The shared shell owns route and preview surfaces. See the
[panel structure and lifetime rules](rules/patterns-panel-structure.md) before
adding a page, changing panel motion, or placing providers around route content.

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
  surface (`DATABASE_URL` + `ENCRYPTION_SECRET`, plus an optional
  `OPENAI_API_KEY` read only by keyword extraction). Runs on cron;
  the app never triggers it. `utils/mobile-profile-manager.ts` owns the
  `mobile_profile` persona pool and mints/caches bearers; secret crypto is
  `packages/db/src/lib/secret-crypto.ts` (shared with the seed and the tRPC
  admin router). A box selects the persona whose `assigned_worker` equals its
  hostname exactly, claiming a free one on first run
  (`packages/db/src/lib/mobile-profile-claim.ts`); nothing else writes the
  assignment. See the
  [scan architecture](../apps/trigger-scan/docs/scan-architecture.md) for waiting
  completion contracts and deployment prerequisites.
- **Keywords as knowledge** (`apps/trigger-scan/src/keywords/`) —
  `scan_keyword` is an independent discovery pool, not a product identity.
  Each newly inserted qualifying listing supplies its ID and title to one
  batched LLM extraction stage (up to 50 titles per request). Extracted phrases
  are stored as returned, trimmed; exact marketplace/phrase matches reuse the
  existing keyword and update only `last_seen_at`. There is no listing FK,
  attempt counter, unresolved selector, or manual keyword retry task.
  Extraction errors are nonfatal and do not refresh listing timestamps.
  `keyword_llm_enabled` disables extraction; a missing API key skips it.
  Try the prompt without writes using `bun --cwd apps/trigger-scan keywords:try "title" …`.
  Unit tests: `bun --cwd apps/trigger-scan test`.

Deploy via root scripts `trigger-scan:dev` / `trigger-scan:deploy` (they pass
`-a https://trigger.sparkyidea.com --profile sparkyidea`; run
`trigger login -a https://trigger.sparkyidea.com --profile sparkyidea` once).

---

## Database operations

### Listing observations

`scan_listing` holds current descriptive fields and source-reported listing sales.
Every saved full listing has at least one `scan_listing_variant`: a native default
or a generated `__default__` for source-confirmed simple listings without a native
variant ID. Variants hold current price/currency, attributes, and a required status
(`in_stock`, `out_of_stock`, or `removed`). A shown unit is in stock unless the
source reports it sold out. They have no sales, title, or synthetic flag. Units
missing from a complete scan become removed; reappearance reuses IDs.

`scan_listing_snapshot` holds listing lifetime sales, source-reported 24-hour and
30-day sales, and `created_at`. One full saved scan appends one snapshot, including
unchanged or unknown measurements. No variant snapshots or price history exist.
Nonnegative integer sales are validated by the worker, not duplicate DB checks.

Listing/variant updates and the snapshot are atomic, with one save timestamp for
listing `last_scanned_at`, observed/changed variant `updated_at`, and snapshot
`created_at`. Listing freshness and scheduling use `last_scanned_at`; only completed
scans write listing rows. Keywords are saved independently. Seller/keyword scan
clocks are unchanged. There is no listing updated-at column, scan-start timestamp,
sequence, or start-order rejection. Transaction locks prevent interleaved writes,
but freshness checks are not atomic claims; overlapping completed scans can both
save, with the last transaction determining current values.

Discovery thresholds gate new listings, not valid rescans of existing listings.
Current price ranges exclude removed variants, include out-of-stock units,
and require all current prices known in one currency. Standard relation filters
and scalar rollups remain unscoped and include removed variants.

The schema, worker, tRPC `getListingHistory` reader and Explorer listing cards all
use this contract.

### Migration workflow

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
