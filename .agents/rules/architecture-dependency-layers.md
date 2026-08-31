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
Layer 0  config, dataview, env, marketplace-scan, ui   (no internal deps)
Layer 1  db                                            → env
Layer 2  auth                                          → db, env, ui
Layer 3  trigger-scan                                  → db, env, marketplace-scan
         trpc                                          → auth, db, dataview
Layer 4  apps/app                                      → auth, db, env, trpc, dataview, ui
         apps/api                                      → auth, db, env, trpc
```

**`packages/trigger-scan` isolation:** the scan pipeline runs on a self-hosted
Trigger.dev instance, autonomously on cron. Nothing depends on it — `trpc` and
the apps only read the scan tables it populates. Keep it that way: the job
runner depends on lower layers (db, marketplace-scan); nothing depends back
on it, and nothing outside it imports `@trigger.dev/*`.

### Rules

1. **A package may import only from packages in lower-numbered layers.**
2. **Apps (`apps/*`) sit at the top.** No package imports from any app.
3. **Leaf packages stay leaves.** `ui`, `dataview`, `marketplace-scan`, `config`, `env` must never grow internal `@dashseller/*` deps. They are reusable primitives.
4. **`packages/ui` may not import from `packages/trpc`** — UI must remain framework-/transport-free so it can be embedded anywhere.
5. **`packages/dataview` may not import from `packages/trpc`** — the coupling goes the other way (trpc consumes dataview validators).

### Known violations

None currently.

### When adding a new package

Decide its layer **first**. If it would need to import from a higher layer, the design is wrong — either move logic, or don't add the package.

### Future enforcement

Add Biome `noRestrictedImports` per package to enforce the layering automatically. Until then, this rule is enforced by review.

### Why this matters

Without enforced layering:

- `ui` ends up with tRPC types → can't be embedded standalone.
- `dataview` ends up with auth → can't be reused outside the dashboard.
- Build times balloon because every change rebuilds the world.
- Tests get slow because leaves drag in heavy deps.
