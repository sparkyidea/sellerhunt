import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { dbEnvSchema } from "./db";

export const env = createEnv({
  server: {
    ...dbEnvSchema,
    BETTER_AUTH_SECRET: z.string().min(32),
    /**
     * JWE key for `mobile_profile` credentials/bearers. Must equal the scan
     * worker's `ENCRYPTION_SECRET` (`@dashseller/env/trigger-scan`) — the
     * admin router writes blobs the worker later decrypts.
     */
    ENCRYPTION_SECRET: z.string().min(32),
    API_URL: z.url(),
    /** Public origin of `apps/app`. */
    APP_URL: z.url(),

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
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
