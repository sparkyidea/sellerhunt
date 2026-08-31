import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_WEB_URL: z.url(),
    NEXT_PUBLIC_APP_URL: z.url(),
    NEXT_PUBLIC_DISCORD_URL: z.url().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_DISCORD_URL: process.env.NEXT_PUBLIC_DISCORD_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.npm_lifecycle_event === "build",
});
