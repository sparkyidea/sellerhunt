/**
 * Sandbox setup — loads env, returns Rollo config.
 *
 * Usage: import { getConfig } from "../setup"
 *
 * Requires `sandbox/.env` (copy from `.env.example`):
 *   ROLLO_API_KEY=<key captured from the Rollo iOS app>
 */
import { resolve } from "node:path";
import dotenv from "dotenv";
import type { RolloConfig } from "../../src/types";

const sandboxEnvPath = resolve(import.meta.dirname, "../.env");
dotenv.config({ path: sandboxEnvPath });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}. Check ${sandboxEnvPath}`);
  }
  return value;
}

export function getConfig(): RolloConfig {
  return {
    apiKey: requireEnv("ROLLO_API_KEY"),
    ...(process.env.ROLLO_LANGUAGE
      ? { language: process.env.ROLLO_LANGUAGE }
      : {}),
  };
}
