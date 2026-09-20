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
 *  - `OPENAI_API_KEY` — optional. Only read by keyword extraction
 *    (`resolve-keywords-with-llm`, run inline by `scan-listings-by-ids` for
 *    newly inserted listings), and only when `scan_config.keyword_llm_enabled`
 *    is true. Enabled without a key, the stage logs a warning and skips
 *    extraction for those listings; the scan itself still succeeds. There is
 *    no retry tool or persisted unresolved state.
 */
export const env = createEnv({
  server: {
    ...dbEnvSchema,
    ENCRYPTION_SECRET: z.string().min(32),
    OPENAI_API_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
