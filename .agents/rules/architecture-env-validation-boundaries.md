---
title: Env Validation Boundaries
impact: HIGH
tags: [architecture, env, t3-env, boot, deployments]
---

## Env Validation Boundaries

**Impact: HIGH**

`packages/env` is split into **domain schemas** and **deployment consolidations**. Code inside a deployment imports its deployment-level env, not the domain env modules — so each process boots through exactly one t3-env validator instead of several firing redundantly against the same `process.env`.

### Layout

| Module                    | Kind       | Owns                                                          |
| ------------------------- | ---------- | ------------------------------------------------------------- |
| `env/src/db.ts`           | domain     | `dbEnvSchema` + standalone `env` (DB-only consumers)          |
| `env/src/server.ts`       | deployment | `apps/api` — spreads db + auth/server vars                    |
| `env/src/trigger-scan.ts` | deployment | scan pipeline (self-hosted Trigger.dev) — spreads db + scan vars |
| `env/src/app.ts`          | deployment | `apps/app` — `NEXT_PUBLIC_*` client vars                      |

Each domain module exports an `xxxEnvSchema` shape (composable) and an `env` constant (its own `createEnv` call). Deployment modules import the **schemas**, spread them into a single `createEnv`, and re-export one `env`.

### Rules

1. **Deployment code imports its deployment env.** Trigger workflows → `@dashseller/env/trigger-scan`. `apps/api` server code → `@dashseller/env/server`. Next client code → `@dashseller/env/app`. *Never* import a domain env (e.g. `@dashseller/env/db`) from inside a deployment that already has a consolidated env.
2. **Domain envs are for code that runs outside any deployment** — sandbox scripts that don't boot through the server, one-off scripts, tests that need just one schema.
3. **Domain schemas never spread other domain schemas.** Composition happens at the deployment level. If a domain's code needed another domain's env, that would mean the *consumer* (deployment) needs both — which is already the case via the deployment's consolidation.
4. **Adapter packages don't import env at all.** See `patterns-adapter-package.md` — `packages/marketplace-scan` receives its credentials/config explicitly from callers.

### Why this matters

Every `createEnv({ runtimeEnv: process.env })` call runs synchronously at module load and validates the listed vars. If a trigger task imports a domain env *and* the deployment already validates the same vars via `@dashseller/env/trigger-scan`, the same `process.env` is checked twice. The domain validator usually fires first and throws — its error message is narrower (only the domain's vars), so the operator sees a less informative failure than if the deployment validator ran cleanly with the full picture.

The other failure mode: a domain env that overreaches. A domain schema that spreads `dbEnvSchema` forces `DATABASE_URL` validation even into code paths that have no DB business. That makes the boot graph fragile — small import changes in unrelated packages break sandboxes. Keep domain schemas narrow; let deployments compose.

### Incorrect

```ts
// packages/trigger-scan/src/some-workflow.ts
import { env } from "@dashseller/env/db"; // BAD — domain env from inside a deployment

const url = env.DATABASE_URL;
```

```ts
// packages/env/src/some-domain.ts
import { dbEnvSchema } from "./db";

export const someDomainEnvSchema = {
  ...dbEnvSchema, // BAD — a domain doesn't own DB env
  SOME_API_KEY: z.string().min(1),
};
```

### Correct

```ts
// packages/trigger-scan/src/some-workflow.ts
import { env } from "@dashseller/env/trigger-scan"; // consolidated deployment env

const url = env.DATABASE_URL; // db var, validated once alongside scan vars
```

```ts
// packages/env/src/trigger-scan.ts
export const env = createEnv({
  server: {
    ...dbEnvSchema, // composition at the deployment level
    // ... scan-only vars
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
```

Reference: `packages/env/src/trigger-scan.ts` and `packages/env/src/server.ts` for canonical deployment consolidations.
