import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { dbEnvSchema } from "./db";
import { geoEnvSchema } from "./geo";
import { marketplaceEnvSchema } from "./marketplace";

export const env = createEnv({
  server: {
    ...dbEnvSchema,
    ...geoEnvSchema,
    ...marketplaceEnvSchema,
    BETTER_AUTH_SECRET: z.string().min(32),
    API_URL: z.url(),
    APP_URL: z.url(),

    // Job queue (BullMQ producer — tRPC context)
    REDIS_QUEUE_URL: z.string().min(1),
    // Public base URL of apps/worker — the webhook receiver lives THERE,
    // not on this API. OAuth-connect registers subscription endpoints as
    // `${WEBHOOK_BASE_URL}/webhook/{marketplaceId}`.
    WEBHOOK_BASE_URL: z.url(),
    // Shared secret registered with eBay's notification destination —
    // needed here to create/update the destination at connect time; the
    // worker uses the same value to answer challenges.
    EBAY_WEBHOOK_VERIFICATION_TOKEN: z.string().min(1),

    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    COOKIE_DOMAIN: z.string().optional(),

    // Social providers
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    DISCORD_CLIENT_ID: z.string().min(1),
    DISCORD_CLIENT_SECRET: z.string().min(1),

    // Email
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().min(1),

    // Media storage: Cloudflare R2 (S3-compatible)
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
    R2_PUBLIC_URL: z.url(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
