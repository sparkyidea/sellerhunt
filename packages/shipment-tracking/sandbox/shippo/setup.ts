/**
 * Sandbox setup — loads env, returns Shippo config.
 *
 * Usage: import { getConfig } from "../setup"
 *
 *   SHIPPO_API_TOKEN=<shippo_test_* or shippo_live_* token>
 *   SHIPPO_BASE_URL=<override API host (default https://api.goshippo.com)>
 *
 * Test tokens accept these reserved tracking numbers (carrier "shippo"):
 *   SHIPPO_PRE_TRANSIT, SHIPPO_TRANSIT, SHIPPO_DELIVERED,
 *   SHIPPO_RETURNED, SHIPPO_FAILURE, SHIPPO_UNKNOWN
 */
import { resolve } from "node:path";
import dotenv from "dotenv";

const sandboxEnvPath = resolve(import.meta.dirname, "../.env");
dotenv.config({ path: sandboxEnvPath });

export interface ShippoConfig {
  baseUrl: string;
  token: string;
}

export function getConfig(): ShippoConfig {
  const token = process.env.SHIPPO_API_TOKEN;
  if (!token) {
    throw new Error("SHIPPO_API_TOKEN is required in sandbox/.env");
  }
  return {
    token,
    baseUrl: process.env.SHIPPO_BASE_URL ?? "https://api.goshippo.com",
  };
}
