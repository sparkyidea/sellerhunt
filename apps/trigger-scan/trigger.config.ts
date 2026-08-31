import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk/v3";

/**
 * Config for the **scan** (scraping) worker. This deploys to the
 * self-hosted Trigger.dev instance at https://trigger.sparkyidea.com —
 * the API URL and login profile are passed at the CLI (`-a` +
 * `--profile sparkyidea`, see the package's `trigger:deploy` script),
 * so only the project ref lives here.
 *
 * Env vars uploaded to the worker. Must mirror the schema
 * `@dashseller/env/trigger-scan` validates against — the scan worker
 * deliberately holds no marketplace API credentials, only the DB URL
 * and the encryption key for `mobile_profile` device secrets.
 */
const INCLUDED_ENV_VARS = new Set([
  // db
  "DATABASE_URL",
  // mobile_profile credential encryption
  "ENCRYPTION_SECRET",
]);

export default defineConfig({
  project: "proj_jtxdtdkuxfpuykkwwtxe",
  runtime: "node",
  logLevel: "info",
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10_000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/workflows"],
  build: {
    extensions: [
      syncEnvVars(() =>
        Object.entries(process.env)
          .filter(
            (entry): entry is [string, string] =>
              entry[1] !== undefined && INCLUDED_ENV_VARS.has(entry[0])
          )
          .map(([name, value]) => ({ name, value }))
      ),
    ],
  },
});
