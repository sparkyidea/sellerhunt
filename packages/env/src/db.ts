import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const dbEnvSchema = {
  DATABASE_URL: z.string().min(1),
};

export const env = createEnv({
  server: dbEnvSchema,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: process.env.npm_lifecycle_event === "build",
});
