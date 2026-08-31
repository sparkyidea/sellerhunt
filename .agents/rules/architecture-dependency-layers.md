---
title: Package Dependency Layers
impact: CRITICAL
tags: [architecture, dependency-graph, layering, packages]
---

## Dependency Layers

**Impact: CRITICAL**

Imports between `@dashseller/*` packages flow **one way only** — from higher layers to lower. Violations create cycles, slow builds, and entangle leaf packages with app concerns.

### Current layer order (lowest → highest)

```
Layer 0  env, config, dataview, geo, job-client, marketplace-scan,
         shipment-tracking, taxonomy, ui          (no internal deps)
Layer 1  db                                       → env
         marketplace                              → shipment-tracking
Layer 2  auth                                     → db, env
         sync                                     → db (client subpath ONLY), geo, marketplace
Layer 3  trigger                                  → db, env, marketplace, marketplace-scan, sync
Layer 4  trpc                                     → auth, db, job-client, marketplace, trigger
Layer 5  apps/app                                 → auth, db, env, trpc
         apps/api                                 → auth, db, env, geo, job-client, marketplace, sync, trpc
         apps/worker                              → db, env, geo, job-client, marketplace, shipment-tracking, sync
         apps/web                                 → (no internal deps)
```

**`packages/sync` purity:** the sync domain core is env-free and runner-free.
It may import `@dashseller/db/client` + `@dashseller/db/schema/*` (never the
package root, which loads `@dashseller/env/db`), and must never import
`@dashseller/env` or any job-runner SDK (`@trigger.dev/*`, `bullmq`). All
process concerns (db handle, credentials, logger, clock, geocoder) arrive via
its `SyncContext` — constructed by the shell that hosts it (`apps/worker`,
`packages/trigger-sync` for tracking polls, tests). Verification
grep: `@trigger.dev|@dashseller/env|from "@dashseller/db"` inside
`packages/sync/src` must return nothing.

### Rules

1. **A package may import only from packages in lower-numbered layers.**
2. **Apps (`apps/*`) sit at the top.** No package imports from any app.
3. **Leaf packages stay leaves.** `ui`, `dataview`, `taxonomy`, `config`, `env` must never grow internal `@dashseller/*` deps. They are reusable primitives.
4. **`packages/ui` may not import from `packages/trpc`** — UI must remain framework-/transport-free so it can be embedded anywhere.
5. **`packages/dataview` may not import from `packages/trpc`** — the coupling goes the other way (api consumes dataview validators).

### Known violations

None currently. `packages/trpc` enqueues background work through the
injected `ctx.jobs` (`@dashseller/job-client`, layer 0) — it does **not**
import from `packages/trigger-sync`, `packages/trigger-scan`, or
`@trigger.dev/sdk`. Keep it that way: job runners depend on lower layers
(db, adapters, sync); nothing depends back on them.

### When adding a new package

Decide its layer **first**. If it would need to import from a higher layer, the design is wrong — either move logic, or don't add the package.

### Future enforcement

Add Biome `noRestrictedImports` per package to enforce the layering automatically. Until then, this rule is enforced by review.

### Why this matters

Without enforced layering:

- `ui` ends up with tRPC types → can't be used in `apps/web` standalone.
- `dataview` ends up with auth → can't be reused outside the dashboard.
- Build times balloon because every change rebuilds the world.
- Tests get slow because leaves drag in heavy deps.
