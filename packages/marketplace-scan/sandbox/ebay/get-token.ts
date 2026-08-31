/**
 * Sandbox — derive an eBay bearer from a captured device persona.
 *
 * Verifies the `device_credentials` grant works against the live eBay mobile
 * identity endpoint using the selected persona from `sandbox/ebay/profiles/`
 * (override the pick with `EBAY_PROFILE`). Use this to confirm a fresh persona
 * capture before wiring it into the `mobile_profile` pool, or to grab a
 * short-lived bearer for ad-hoc curl.
 *
 * Setup: drop a persona file in `sandbox/ebay/profiles/` (one
 * `EbayHmacCredentials` object — see that dir's README / `*.example.json`):
 *   {
 *     "clientId":  "eBayInc80-...",
 *     "hmacKey":   "<hex>",
 *     "device4pp": "<token>",
 *     "idfa":      "<uuid>",
 *     "idfv":      "<uuid>",
 *     "deviceId":  "<uuid>",
 *     "guid":      "<uuid>"
 *   }
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/ebay/get-token.ts
 */
import { resolve } from "node:path";
import dotenv from "dotenv";
import { getScanToken } from "../../src/index";
import { loadPersona } from "./_auth";

dotenv.config({
  path: resolve(import.meta.dirname, "../.env"),
});

const credentials = loadPersona();

console.log("Deriving eBay bearer via getScanToken (eBay → mint)...");
const result = await getScanToken({ marketplace: "ebay", credentials });

const ttlSeconds = Math.round((result.expiresAt.getTime() - Date.now()) / 1000);
console.log(`  accessToken: ${result.accessToken.slice(0, 24)}…`);
console.log(
  `  expiresAt:   ${result.expiresAt.toISOString()} (~${ttlSeconds}s)`
);

process.exit(0);
