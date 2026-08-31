/**
 * Sandbox setup — loads env, returns Package Tracker (Ship24) config.
 *
 * Usage: import { getConfig } from "../setup"
 *
 *   PACKAGE_TRACKER_CREDENTIAL=<Bearer token captured from the iOS app>
 *
 * The token rides as `Authorization: Bearer <token>` against
 * `https://api.ship24.com/public/v1/trackers/track`.
 */
import { resolve } from "node:path";
import dotenv from "dotenv";
import type { PackageTrackerConfig } from "../../src/types";

const sandboxEnvPath = resolve(import.meta.dirname, "../.env");
dotenv.config({ path: sandboxEnvPath });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}. Check ${sandboxEnvPath}`);
  }
  return value;
}

export function getConfig(): PackageTrackerConfig {
  return {
    provider: "package-tracker",
    credential: requireEnv("PACKAGE_TRACKER_CREDENTIAL"),
  };
}
