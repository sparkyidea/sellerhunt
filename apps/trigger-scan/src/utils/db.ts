import { createDbClient } from "@dashseller/db/client";
import { env } from "@dashseller/env/trigger-scan";

/**
 * The scan worker's database client, built here from the deployment env so
 * the process boots through one validator (`@dashseller/env/trigger-scan`)
 * rather than also running the DB domain validator behind `@dashseller/db`.
 *
 * Tuned for checkpointing: a short idle timeout lets a connection close on its
 * own before a checkpoint restore, and the pool `error` listener that
 * `createDbClient` installs handles a socket closed during suspension.
 */
export const { db } = createDbClient(env.DATABASE_URL, {
  max: 1,
  idleTimeoutMillis: 10_000,
});
