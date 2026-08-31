---
title: Feature Organization
impact: HIGH
tags: [architecture, feature, organization]
---

## Feature Organization: Horizontal Layers

**Impact: HIGH**

Dashseller uses **horizontal layering** (one package per concern), not cal.diy-style vertical slices. This is a deliberate choice — keep it consistent.

### The layout

| Concern              | Where it lives                                   |
| -------------------- | ------------------------------------------------ |
| Database schema      | `packages/db/src/schema/`                        |
| Auth                 | `packages/auth/src/`                             |
| External APIs        | `packages/marketplace-scan/src/adapters/`        |
| Background jobs      | `apps/trigger-scan/src/workflows/` (self-hosted Trigger.dev, cron-driven) |
| Domain logic + API   | `packages/trpc/src/routers/`                      |
| Reusable data UI     | `packages/dataview/src/`                         |
| Shared UI primitives | `packages/ui/src/components/`                    |
| App-specific UI      | `apps/app/src/{app,components,modules}/`         |

### Adding a new feature

A new feature like "watchlists" typically touches **multiple packages** in this order:

1. Schema in `packages/db/src/schema/watchlist.ts`.
2. `bun db:generate` (user applies migration).
3. tRPC router in `packages/trpc/src/routers/watchlist.ts` — register in `routers/index.ts`.
4. If ingestion-side: adapter method in `packages/marketplace-scan/`, workflow in `apps/trigger-scan/src/workflows/`.
5. Route + UI in `apps/app/src/app/(app)/watchlists/` and `apps/app/src/modules/`.
6. Reusable cells/views in `packages/dataview/` only if they generalize.

### When to introduce a new package

Only when:

- The code is consumed by **multiple apps** (`apps/app`, `apps/api`).
- Or the code is a clear independent concern (third-party adapter, runtime).

Do **not** create per-feature packages (`packages/returns/`). Keep features inside the existing layer packages.

### Why not vertical slices

Vertical slices (à la cal.diy) make sense for very large feature surfaces with strict ownership boundaries. At our scale, the indirection costs more than it saves. Revisit if any single feature grows large enough to warrant its own package.
