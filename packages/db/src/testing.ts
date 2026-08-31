import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDbClient } from "./client";

/**
 * Connection string for integration tests. Defaults match
 * docker-compose.test.yml at the repo root; override with
 * TEST_DATABASE_URL (CI services, custom ports).
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://dashseller:dashseller@localhost:54329/dashseller_test";

/**
 * Applies every migration in src/migrations to the test database.
 * Incremental and safe to call from every suite: drizzle records applied
 * entries in drizzle.__drizzle_migrations and re-applies nothing.
 */
export async function migrateTestDb(
  connectionString: string = TEST_DATABASE_URL
): Promise<void> {
  const { db, close } = createDbClient(connectionString);
  try {
    await migrate(db, {
      migrationsFolder: resolve(
        dirname(fileURLToPath(import.meta.url)),
        "migrations"
      ),
    });
  } finally {
    await close();
  }
}
