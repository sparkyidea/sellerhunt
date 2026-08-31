/**
 * Sandbox auth helper for eBay scripts.
 *
 * Loads a device persona from `sandbox/ebay/profiles/*.json` (the same
 * directory the `mobile-profile.ts` seed loads into the pool) and derives a
 * fresh bearer via the `getScanToken` factory. Sandbox scripts call
 * `loadAuthToken()` instead of requiring the operator to paste a short-lived
 * bearer into `.env`.
 *
 * The directory is the single source of truth — there is no env-var fallback.
 *
 * Persona selection (filename stem = label):
 *   - `EBAY_PROFILE=w-00003` → pick that file.
 *   - `EBAY_PROFILE=random`  → pick a random persona (rotation testing).
 *   - unset                  → first file (deterministic).
 *
 * The derived token is short-lived (~1h). Each script run derives fresh —
 * fine for sandbox usage, where iteration speed >> bearer-churn cost.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EbayCredentials } from "../../src/adapters/ebay/auth/get-token";
import { getScanToken } from "../../src/index";

const PROFILE_DIR = resolve(import.meta.dirname, "profiles");
const JSON_EXT = /\.json$/;

const REQUIRED_FIELDS: (keyof EbayCredentials)[] = [
  "clientId",
  "hmacKey",
  "device4pp",
  "idfa",
  "idfv",
  "deviceId",
  "guid",
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

function parsePersona(raw: string, source: string): EbayCredentials {
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
    clientId: parsed.clientId as string,
    hmacKey: parsed.hmacKey as string,
    device4pp: parsed.device4pp as string,
    idfa: parsed.idfa as string,
    idfv: parsed.idfv as string,
    deviceId: parsed.deviceId as string,
    guid: parsed.guid as string,
  };
}

/** Resolve which persona file to load, honoring the `EBAY_PROFILE` selector. */
function selectProfileFile(files: string[]): string {
  const selector = process.env.EBAY_PROFILE;

  if (selector && selector !== "random") {
    const wanted = selector.endsWith(".json") ? selector : `${selector}.json`;
    const match = files.find((f) => f === wanted);
    if (!match) {
      console.error(
        `EBAY_PROFILE="${selector}" not found in ${PROFILE_DIR}. Available: ${files.join(", ")}`
      );
      process.exit(1);
    }
    return match;
  }

  const index =
    selector === "random" ? Math.floor(Math.random() * files.length) : 0;
  const file = files[index];
  if (!file) {
    console.error(`No eBay personas available to select in ${PROFILE_DIR}`);
    process.exit(1);
  }
  return file;
}

export function loadPersona(): EbayCredentials {
  const files = listProfileFiles();
  if (files.length === 0) {
    console.error(
      `No eBay personas found. Add capture files to ${PROFILE_DIR} ` +
        "(see sandbox/ebay/profiles/README.md)."
    );
    process.exit(1);
  }

  const file = selectProfileFile(files);
  console.log(`Persona: ${file.replace(JSON_EXT, "")}`);
  return parsePersona(
    readFileSync(resolve(PROFILE_DIR, file), "utf8"),
    `ebay/profiles/${file}`
  );
}

export async function loadAuthToken(): Promise<string> {
  const credentials = loadPersona();
  console.log("Deriving fresh eBay bearer from the selected persona...");
  const result = await getScanToken({ marketplace: "ebay", credentials });
  return result.accessToken;
}
