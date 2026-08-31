import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const marketplaceEnvSchema = {
  ENCRYPTION_SECRET: z.string().min(32),
  EBAY_CLIENT_ID: z.string().min(1),
  EBAY_CLIENT_SECRET: z.string().min(1),
  EBAY_RU_NAME: z.string().min(1),
  SHOPIFY_CLIENT_ID: z.string().min(1),
  SHOPIFY_CLIENT_SECRET: z.string().min(1),
};

export const env = createEnv({
  server: marketplaceEnvSchema,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
