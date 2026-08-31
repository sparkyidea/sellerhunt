---
title: Adapter Package Structure
impact: HIGH
tags: [patterns, adapters, marketplace, geo, shipment-tracking, marketplace-scan, structure]
---

## Adapter Package Structure

**Impact: HIGH**

Adapter packages (`packages/marketplace`, `packages/geo`, `packages/shipment-tracking`, `packages/marketplace-scan`) share a structural template so call sites, file locations, and naming stay predictable as we add providers. Drift between these packages costs review time and makes onboarding new adapters slower.

This rule covers **layout and naming**. For the boot-time env discipline these packages also obey, see `patterns-adapter-package.md`.

### Layout

```
packages/<name>/
  src/
    index.ts                     ← factory only. createXClient(...). Nothing else.
    types.ts                     ← public types entry: shared types + re-export of contract
    errors.ts                    ← base/shared error class (only if cross-adapter)
    utils/index.ts               ← cross-adapter helpers (omit the folder if empty)
    adapters/
      base.ts                    ← contract interface(s)
      <provider>/
        client.ts                ← class implementing the contract
        http.ts                  ← fetch wrapper (use when no third-party SDK exists)
        create-<vendor>-client.ts ← factory for a third-party SDK, ONLY when shared across files
        errors.ts                ← provider-specific error subclasses
        enums.ts                 ← flat file; promote to enum/ folder only if 3+ files
        raw-types.ts             ← upstream response shapes (internal, not sub-path exported)
        api/
          <method>.ts            ← one file per contract method
          mapper/
            map-<thing>.ts
            __tests__/
        auth/                    ← only if provider needs OAuth-style flow
          <method>.ts
```

### `package.json` exports

```json
{
  "exports": {
    ".":        { "default": "./src/index.ts" },
    "./types":  { "default": "./src/types.ts" },
    "./errors": { "default": "./src/errors.ts" },
    "./utils":  { "default": "./src/utils/index.ts" }
  }
}
```

Only include sub-paths whose source file exists. Never barrel-export types or utils from `index.ts` — sub-paths keep the factory surface narrow and tree-shaking honest.

### Factory signature — pick the one that fits the configs

Two valid shapes. The configs across providers decide:

**Uniform configs** (geo, marketplace, marketplace-scan) → take provider as a separate arg:

```ts
export function createGeocoder(provider: GeocoderProvider, config: GeoFactoryConfig): Geocoder
```

**Heterogeneous configs per provider** (shipment-tracking) → discriminator field in config:

```ts
export type ProviderConfig = PackageTrackerConfig /* | NextProviderConfig */;
// PackageTrackerConfig has { provider: "package-tracker", credential, ... }
// A future provider with no credential would be { provider: "...", ... }

export function createTrackingClient(config: ProviderConfig): TrackingClient
```

The discriminator-in-config form gives proper type narrowing when each provider needs structurally different credentials. The two-arg form is cleaner when configs share a shape. Don't force one onto the other.

### `http.ts` vs `create-<vendor>-client.ts`

Two distinct concerns, two honest names. Both are internal to the adapter folder.

| Situation | File name | What it contains |
|---|---|---|
| No third-party SDK exists (REST against vendor's API) | `http.ts` | `<vendor>Fetch(config, request)` — base URL, auth header injection, error mapping, JSON parsing |
| Wrapping a real third-party SDK constructor, shared between `auth/client.ts` and `api/client.ts` | `create-<vendor>-client.ts` | Factory(ies) returning a configured SDK instance |
| Wrapping a real third-party SDK but used by only one `client.ts` | (no separate file) | Construct inline in the adapter `client.ts` constructor |

`sdk.ts` as a generic file name is banned — it conflates the two and lies when there is no SDK.

### What does NOT belong in `index.ts`

- Type re-exports (use `./types` sub-path).
- Utility re-exports (use `./utils` sub-path).
- `isXSupported(provider)` / `getSupportedXProviders()` helpers — these have repeatedly grown with zero callers. Don't add them.
- Standalone method re-exports (e.g. `getListing`, `getAuthToken`). If a caller genuinely needs a per-method import, add a narrow sub-path export instead.

### What does NOT belong in `<provider>/`

- Files named `types.ts` — use `raw-types.ts` so it's clear they hold upstream shapes, not contract types.
- Underscore-prefixed private files at the adapter root (e.g. `_search.ts`). Put helpers under `api/helper/`.

### Contract location

The contract interface lives in `adapters/base.ts`. `src/types.ts` re-exports it so the `/types` sub-path is the single import surface for consumers:

```ts
// src/types.ts
export type { XClient } from "./adapters/base";
export type { /* shared types */ } from "./adapters/some-shared-types";
```

Adapter implementations still import the contract from `./base` directly — only consumers go through `/types`.

### Reference

Canonical example: `packages/shipment-tracking/` (heterogeneous config form).
