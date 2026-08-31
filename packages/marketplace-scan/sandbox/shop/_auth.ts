/**
 * Sandbox auth helper for shop.app scripts.
 *
 * Loads a device persona from `sandbox/shop/profiles/*.json` (the same
 * directory the `mobile-profile.ts` seed loads into the pool). Scripts call
 * `loadPersona()` and pass the result to `getScanToken` to mint a guest bearer
 * (no refresh token → the orchestrator falls straight to `SignInAsGuest`); the
 * same device-identity headers are also sent on every data call.
 *
 * The directory is the single source of truth — there is no env-var fallback.
 *
 * Persona selection (filename stem = label):
 *   - `SHOP_PROFILE=w-00001` → pick that file.
 *   - `SHOP_PROFILE=random`  → pick a random persona (rotation testing).
 *   - unset                  → first file (deterministic).
 *
 * Note: unlike eBay's HMAC key, none of a shop persona's fields are secrets —
 * they're device-identity headers. The real secret is the refresh token
 * shop.app issues on first `SignInAsGuest`, which the pool stores on the row.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ShopCredentials } from "../../src/adapters/shop/auth/get-token";

const PROFILE_DIR = resolve(import.meta.dirname, "profiles");
const JSON_EXT = /\.json$/;

const REQUIRED_FIELDS: (keyof ShopCredentials)[] = [
  "deviceIdHw",
  "deviceName",
  "deviceId",
];

/** Real persona files only — skip `*.example.json` placeholders. */
function listProfileFiles(): string[] {
  try {
    return readdirSync(PROFILE_DIR)
      .filter((f) => f.endsWith(".json") && !f.endsWith(".example.json"))
      .sort();
  } catch {
    return [];
  }
}

function validate(parsed: Record<string, unknown>, source: string): void {
  for (const field of REQUIRED_FIELDS) {
    if (typeof parsed[field] !== "string" || parsed[field] === "") {
      console.error(`${source} missing or empty field: ${field}`);
      process.exit(1);
    }
  }
}

function parsePersona(raw: string, source: string): ShopCredentials {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    console.error(
      `${source} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  validate(parsed, source);

  return {
    deviceId: parsed.deviceId as string,
    deviceIdHw: parsed.deviceIdHw as string,
    deviceName: parsed.deviceName as string,
  };
}

/** Resolve which persona file to load, honoring the `SHOP_PROFILE` selector. */
function selectProfileFile(files: string[]): string {
  const selector = process.env.SHOP_PROFILE;

  if (selector && selector !== "random") {
    const wanted = selector.endsWith(".json") ? selector : `${selector}.json`;
    const match = files.find((f) => f === wanted);
    if (!match) {
      console.error(
        `SHOP_PROFILE="${selector}" not found in ${PROFILE_DIR}. Available: ${files.join(", ")}`
      );
      process.exit(1);
    }
    return match;
  }

  const index =
    selector === "random" ? Math.floor(Math.random() * files.length) : 0;
  const file = files[index];
  if (!file) {
    console.error(`No shop personas available to select in ${PROFILE_DIR}`);
    process.exit(1);
  }
  return file;
}

export function loadPersona(): ShopCredentials {
  const files = listProfileFiles();
  if (files.length === 0) {
    console.error(
      `No shop personas found. Add capture files to ${PROFILE_DIR} ` +
        "(see sandbox/shop/profiles/README.md)."
    );
    process.exit(1);
  }

  const file = selectProfileFile(files);
  console.log(`Persona: ${file.replace(JSON_EXT, "")}`);
  return parsePersona(
    readFileSync(resolve(PROFILE_DIR, file), "utf8"),
    `shop/profiles/${file}`
  );
}
