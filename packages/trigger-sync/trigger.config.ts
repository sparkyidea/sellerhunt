import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk/v3";

/**
 * Config for the **tracking** worker (carrier tracking polls — marketplace
 * sync lives in `apps/worker`). This deploys to Trigger.dev Cloud (the
 * default api.trigger.dev).
 *
 * Env vars uploaded to the Trigger.dev worker. Must mirror the schema
 * `@dashseller/env/trigger-sync` validates against — adding a var to a
 * trigger-consumed schema in `@dashseller/env/*` requires adding it
 * here so the deploy actually ships the value.
 */
const INCLUDED_ENV_VARS = new Set([
  // db
  "DATABASE_URL",
  // geo
  "GOOGLE_MAPS_API_KEY",
  "ROLLO_API_KEY",
  // tracking
  "PACKAGE_TRACKER_CREDENTIAL",
]);

export default defineConfig({
  project: "proj_vwdtyixntworrzcxrvwl",
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
