import { createEnv } from "@t3-oss/env-core";
import { dbEnvSchema } from "./db";
import { geoEnvSchema } from "./geo";
import { trackingEnvSchema } from "./tracking";

/**
 * Consolidated env validation for the **tracking** Trigger.dev worker
 * deployment (Trigger.dev Cloud). Mirrors `server.ts`'s pattern: each
 * domain owns its schema in its own file, and this deployment file
 * spreads the schemas it actually uses into one `createEnv` so missing
 * vars fail the worker at boot instead of lazily at first task call.
 *
 * The scan worker (self-hosted) validates a much smaller surface — see
 * `trigger-scan.ts`. Marketplace sync lives in `apps/worker` — see
 * `worker.ts`.
 *
 * The tracking worker consumes:
 *  - `db` — poll-tracking[s] reads/writes via `@dashseller/db`
 *  - `geo` — tracking-event coordinate resolution via `@dashseller/geo`
 *  - `tracking` — poll-tracking[s] calls the Package Tracker (Ship24)
 *    mobile endpoint with a Bearer token captured from the iOS app.
 */
export const env = createEnv({
  server: {
    ...dbEnvSchema,
    ...geoEnvSchema,
    ...trackingEnvSchema,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
