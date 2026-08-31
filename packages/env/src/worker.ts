import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { dbEnvSchema } from "./db";
import { geoEnvSchema } from "./geo";
import { marketplaceEnvSchema } from "./marketplace";

/**
 * Consolidated env validation for **apps/worker** (the BullMQ worker).
 * Mirrors the deployment-file pattern of `server.ts`/`trigger-sync.ts`:
 * each domain owns its schema; this file spreads exactly what the worker
 * consumes so a missing var fails boot, never a first job.
 *
 * No tracking vars: carrier polling stays on Trigger.dev — the worker
 * owns marketplace sync only.
 *
 * The worker owns its Redis connections and its own db client — nothing
 * here is imported by `packages/sync` (env-free) or `packages/job-client`
 * (env-free); apps/worker reads this and injects values.
 */
export const env = createEnv({
  server: {
    ...dbEnvSchema,
    ...geoEnvSchema,
    ...marketplaceEnvSchema,
    REDIS_QUEUE_URL: z.string().min(1),
    /**
     * Public base URL of THIS worker. Marketplaces deliver webhooks to
     * `${WEBHOOK_BASE_URL}/webhook/{marketplaceId}`, and the challenge
     * hash + subscription reconciliation are computed over it — must
     * byte-match what marketplaces have registered.
     */
    WEBHOOK_BASE_URL: z.url(),
    EBAY_WEBHOOK_VERIFICATION_TOKEN: z.string().min(1),
    /** Gate for upsertJobScheduler registration — off until cutover (P16). */
    SYNC_SCHEDULERS_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    /** Health/readiness HTTP port. */
    PORT: z.coerce.number().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
