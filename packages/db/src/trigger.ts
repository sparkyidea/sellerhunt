import { env } from "@dashseller/env/db";
import { createDbClient } from "./client";

/**
 * Trigger.dev worker singleton. A short idle timeout lets connections close
 * before a checkpoint restore, while the error listener installed by
 * `createDbClient` safely handles a socket closed during suspension.
 */
export const { db } = createDbClient(env.DATABASE_URL, {
  max: 1,
  idleTimeoutMillis: 10_000,
});

export type { Database } from "./client";
