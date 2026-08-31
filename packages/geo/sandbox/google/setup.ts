/**
 * Sandbox setup — loads env, returns Google geo config.
 *
 * Usage: import { getConfig } from "../setup"
 *
 * Requires `sandbox/.env` (copy from `.env.example`):
 *   GOOGLE_MAPS_API_KEY=<Maps Platform key>
 */
import { resolve } from "node:path";
import dotenv from "dotenv";
import type { GoogleGeoConfig } from "../../src/types";

const sandboxEnvPath = resolve(import.meta.dirname, "../.env");
dotenv.config({ path: sandboxEnvPath });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}. Check ${sandboxEnvPath}`);
  }
  return value;
}

export function getConfig(): GoogleGeoConfig {
  return {
    apiKey: requireEnv("GOOGLE_MAPS_API_KEY"),
    ...(process.env.GOOGLE_MAPS_LANGUAGE
      ? { language: process.env.GOOGLE_MAPS_LANGUAGE }
      : {}),
  };
}
