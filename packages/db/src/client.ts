import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// biome-ignore lint/performance/noNamespaceImport: needed for drizzle schema
import * as schema from "./schema";

/**
 * Env-free database client factory. Consumers that must not pull in
 * `@dashseller/env` (apps/worker, packages/sync, tests) import from
 * `@dashseller/db/client` and inject the connection string themselves.
 * The package root keeps its env-validated singleton built on top of this.
 */
export function createDbClient(connectionString: string): {
  db: Database;
  close: () => Promise<void>;
} {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

export type Database = ReturnType<typeof drizzle<typeof schema>>;
