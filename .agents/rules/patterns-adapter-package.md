---
title: Adapter Package Explicit Credentials
impact: HIGH
tags: [patterns, adapters, marketplace, geo, env, credentials]
---

## Adapter Package Explicit Credentials

**Impact: HIGH**

Adapter packages (`packages/marketplace`, `packages/geo`,
`packages/shipment-tracking`, `packages/marketplace-scan`) are pure
external-service clients. Runtime package code must not resolve secrets from
env or DB. Callers at deployment boundaries (`apps/api`,
`packages/trigger-sync`, `packages/trigger-scan`, tests, sandbox setup scripts)
resolve credentials and pass explicit config into factories/functions.

For auth-scheme selection see `patterns-adapter-auth.md`. For DB persistence
shapes see `data-adapter-token-storage.md`.

### Why this matters

Reading env inside adapter packages creates boot-time validation side effects
for every transitive importer. Reading DB inside adapters tangles reusable HTTP
clients with app ownership, encryption, retry, and persistence policy. Keeping
adapters explicit makes them reusable in production, tests, and sandboxes.

### The contract

1. **Factories require explicit config.** `createX(provider, config)` receives
   every credential it needs. No factory default reads from env.
2. **No runtime env or DB reads.** `src/**` in adapter packages must not import
   `@dashseller/env`, import `@dashseller/db`, or read `process.env`.
3. **Token refresh is protocol-only.** Adapter methods may call upstream
   refresh endpoints and return token results, but callers persist those
   results.
4. **Code-owned protocol constants are allowed.** API version pins, fixed
   headers, scopes, and endpoint URLs may live in adapter code when changing
   them requires code compatibility work.
5. **Sandbox setup can resolve secrets.** Files under `sandbox/` may read env
   or DB to exercise live APIs; they are dev harnesses, not package runtime.
6. **Constructors validate config.** Missing required config should throw a
   clear error naming the config field.

### Correct

```ts
// packages/<adapter>/src/index.ts
export function createX(provider: Provider, config: XConfig): X {
  return new XClient(config);
}
```

```ts
// deployment boundary
import { env } from "@dashseller/env/trigger";
import { createX } from "@dashseller/x";

const client = createX("provider", { apiKey: env.PROVIDER_API_KEY });
```

### Incorrect

```ts
// packages/<adapter>/src/index.ts
import { env } from "@dashseller/env/<domain>";

export function createX(provider: Provider, config?: XConfig): X {
  return new XClient({ apiKey: config?.apiKey ?? env.PROVIDER_API_KEY });
}
```

```ts
// packages/<adapter>/src/adapters/<provider>/client.ts
import { db } from "@dashseller/db";
```

### Current package expectations

- `@dashseller/geo`: caller passes `apiKey`.
- `@dashseller/shipment-tracking`: caller passes provider config.
- `@dashseller/marketplace`: caller passes OAuth app credentials plus
  row-owned access/refresh tokens; `client.refresh()` returns tokens for the
  caller to persist.
- `@dashseller/marketplace-scan`: caller passes `getAuthToken`; token pools and
  cached bearer persistence live in `MobileProfileTokenManager`.
