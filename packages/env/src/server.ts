import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { dbEnvSchema } from "./db";

export const env = createEnv({
  server: {
    ...dbEnvSchema,
    BETTER_AUTH_SECRET: z.string().min(32),
    API_URL: z.url(),
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
