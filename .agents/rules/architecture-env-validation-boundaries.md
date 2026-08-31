---
title: Env Validation Boundaries
impact: HIGH
tags: [architecture, env, t3-env, boot, deployments]
---

## Env Validation Boundaries

**Impact: HIGH**

`packages/env` is split into **domain schemas** and **deployment consolidations**. Code inside a deployment imports its deployment-level env, not the domain env modules — so each process boots through exactly one t3-env validator instead of several firing redundantly against the same `process.env`.

### Layout

| Module                          | Kind          | Owns                                                    |
| ------------------------------- | ------------- | ------------------------------------------------------- |
| `env/src/db.ts`                 | domain        | `dbEnvSchema` + standalone `env` (DB-only consumers)    |
| `env/src/marketplace.ts`        | domain        | `marketplaceEnvSchema` + standalone `env`               |
| `env/src/geo.ts`                | domain        | `geoEnvSchema` + standalone `env`                       |
| `env/src/tracking.ts`           | domain        | `trackingEnvSchema` + standalone `env`                  |
| `env/src/server.ts`             | deployment    | `apps/api` — spreads db + geo + marketplace + auth/email/R2 + Redis queue producer vars |
| `env/src/trigger-sync.ts`       | deployment    | trigger tracking worker — spreads db + geo + tracking   |
| `env/src/worker.ts`             | deployment    | `apps/worker` (BullMQ) — spreads db + geo + marketplace + tracking + `REDIS_QUEUE_URL`, `API_URL`, `EBAY_WEBHOOK_VERIFICATION_TOKEN`, `SYNC_SCHEDULERS_ENABLED`, `PORT?` |
| `env/src/app.ts`                | deployment    | `apps/app` — `NEXT_PUBLIC_*` client vars                |
| `env/src/web.ts`                | deployment    | `apps/web` — `NEXT_PUBLIC_*` client vars                |

Each domain module exports an `xxxEnvSchema` shape (composable) and an `env` constant (its own `createEnv` call). Deployment modules import the **schemas**, spread them into a single `createEnv`, and re-export one `env`.

### Rules

1. **Deployment code imports its deployment env.** Trigger workflows → `@dashseller/env/trigger-sync` / `@dashseller/env/trigger-scan`. `apps/api` server code → `@dashseller/env/server`. Next client code → `@dashseller/env/app` or `@dashseller/env/web`. *Never* import a domain env (`@dashseller/env/marketplace`, `@dashseller/env/geo`, etc.) from inside a deployment that already has a consolidated env.
2. **Domain envs are for code that runs outside any deployment** — sandbox scripts that don't boot through the worker/server, one-off scripts, tests that need just one schema.
3. **Domain schemas never spread other domain schemas.** Marketplace doesn't spread `dbEnvSchema`; geo doesn't spread `marketplaceEnvSchema`. Composition happens at the deployment level. If marketplace src needed DB env, that would mean the *consumer* (deployment) needs both — which is already the case via the deployment's consolidation.
4. **Adapter packages don't import env at all.** See `patterns-adapter-package.md`.
5. **`packages/sync` and `packages/job-client` never import env.** They are env-free by contract: the sync core receives everything through its `SyncContext`; the job client receives its Redis URL through `createJobClient(redisUrl)`. Only the process shells (`apps/api` via `server.ts`, `apps/worker` via `worker.ts`, trigger deployments via `trigger-sync.ts`) read env and inject.

### Why this matters

Every `createEnv({ runtimeEnv: process.env })` call runs synchronously at module load and validates the listed vars. If a trigger task imports `@dashseller/env/marketplace` *and* the trigger worker already validates the same vars via `@dashseller/env/trigger`, the same `process.env` is checked twice. The domain validator usually fires first and throws — its error message is narrower (only the domain's vars), so the operator sees a less informative failure than if the deployment validator ran cleanly with the full picture.

The other failure mode: a domain env that overreaches. `env/marketplace.ts` used to spread `dbEnvSchema`, so importing it forced `DATABASE_URL` validation even into code paths that had no DB business. That made the boot graph fragile — small import changes in unrelated packages broke sandboxes. Keep domain schemas narrow; let deployments compose.

### Incorrect

```ts
// packages/trigger-sync/src/context.ts
import { env } from "@dashseller/env/geo"; // BAD — domain env from inside trigger

const apiKey = env.ROLLO_API_KEY;
```

```ts
// packages/env/src/marketplace.ts
import { dbEnvSchema } from "./db";

export const marketplaceEnvSchema = {
  ...dbEnvSchema, // BAD — marketplace doesn't own DB env
  EBAY_CLIENT_ID: z.string().min(1),
};
```

### Correct

```ts
// packages/trigger-sync/src/context.ts
import { env } from "@dashseller/env/trigger-sync"; // consolidated worker env

const apiKey = env.ROLLO_API_KEY; // geo var, validated alongside db/tracking
```

```ts
// packages/env/src/marketplace.ts
export const marketplaceEnvSchema = {
  ENCRYPTION_SECRET: z.string().min(32),
  EBAY_CLIENT_ID: z.string().min(1),
  // ... marketplace-only vars
};

// packages/env/src/trigger.ts (or server.ts)
export const env = createEnv({
  server: {
    ...dbEnvSchema,
    ...marketplaceEnvSchema, // composition at the deployment level
    ...geoEnvSchema,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
```

Reference: `packages/env/src/trigger.ts` and `packages/env/src/server.ts` for canonical deployment consolidations.
