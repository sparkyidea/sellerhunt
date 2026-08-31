/**
 * Sandbox — derive a shop.app bearer from a captured device persona.
 *
 * Goes through `getScanToken` (the factory). Without a refresh token in the
 * input, the orchestrator falls straight to the SignInAsGuest mint, which is
 * what we want when bootstrapping a fresh persona capture.
 *
 * Setup: drop a persona file in `sandbox/shop/profiles/` (one `ShopCredentials`
 * object — see that dir's README / `*.example.json`). Pick a specific persona
 * with `SHOP_PROFILE`.
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/shop/get-token.ts
 */
import { resolve } from "node:path";
import dotenv from "dotenv";
import { getScanToken } from "../../src/index";
import { loadPersona } from "./_auth";

dotenv.config({
  path: resolve(import.meta.dirname, "../.env"),
});

const persona = loadPersona();

console.log("Deriving shop.app bearer via getScanToken (no refresh → mint)...");
const result = await getScanToken({
  marketplace: "shop",
  credentials: persona,
});

const ttlSeconds = Math.round((result.expiresAt.getTime() - Date.now()) / 1000);
console.log(`  accessToken:  ${result.accessToken.slice(0, 24)}…`);
console.log(
  `  refreshToken: ${result.refreshToken?.slice(0, 24) ?? "(none)"}…`
);
console.log(
  `  expiresAt:    ${result.expiresAt.toISOString()} (~${ttlSeconds}s)`
);

process.exit(0);
