import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

// biome-ignore lint/performance/noNamespaceImport: needed for drizzle schema
import * as schema from "./schema";

/** Minimal sink for pool diagnostics. Shaped to accept the Trigger.dev logger. */
export interface DbLogger {
  warn: (message: string, properties?: Record<string, unknown>) => void;
}

/**
 * Per-consumer pool tuning. Long-lived API processes keep the pg defaults;
 * checkpointed workers pass a short `idleTimeoutMillis` and a small `max` so
 * few sockets survive long enough to be carried across a restore.
 */
export interface DbClientOptions
  extends Pick<
    PoolConfig,
    "max" | "idleTimeoutMillis" | "connectionTimeoutMillis" | "keepAlive"
  > {
  logger?: DbLogger;
}

export interface DbClient {
  close: () => Promise<void>;
  db: Database;
}

/** Fallback sink when a consumer injects no logger. */
export const defaultDbLogger: DbLogger = {
  warn: (message, properties) => {
    console.warn(message, properties);
  },
};

/**
 * Env-free database client factory. Consumers that must not pull in
 * `@dashseller/env` (integration tests) import from `@dashseller/db/client`
 * and inject the connection string themselves. The package root keeps its
 * env-validated singleton built on top of this.
 */
export function createDbClient(
  connectionString: string,
  options: DbClientOptions = {}
): DbClient {
  const { logger = defaultDbLogger, ...poolConfig } = options;
  const pool = new Pool({ connectionString, ...poolConfig });

  // pg-pool drops the client from the pool before it emits `error`, so an
  // idle socket that dies (network drop, checkpoint restore on another
  // machine) is already gone by the time this runs and the next query opens a
  // fresh connection. Without the listener the same event is an uncaught
  // exception that kills the process. Query-time failures still reject their
  // own promise and are untouched here.
  pool.on("error", (error) => {
    logger.warn("[db] idle connection dropped", {
      error: error.message,
      stats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    });
  });

  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}

export type Database = ReturnType<typeof drizzle<typeof schema>>;
