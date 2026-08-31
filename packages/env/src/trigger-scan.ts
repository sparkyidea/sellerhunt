import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { dbEnvSchema } from "./db";

/**
 * Env validation for the **scan** Trigger.dev worker deployment
 * (self-hosted at trigger.sparkyidea.com). The scraping tasks touch a
 * deliberately tiny secret surface so the self-hosted box never holds
 * marketplace API credentials:
 *
 *  - `db` — every workflow reads/writes via `@dashseller/db`.
 *  - `ENCRYPTION_SECRET` — `mobile-profile-manager` encrypts/decrypts the
 *    device credentials and minted bearers stored on `mobile_profile`.
 *    (Same key the sync worker uses, validated standalone here so we
 *    don't drag in the EBAY_/SHOPIFY_ marketplace credential schema.)
 */
export const env = createEnv({
  server: {
    ...dbEnvSchema,
    ENCRYPTION_SECRET: z.string().min(32),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
