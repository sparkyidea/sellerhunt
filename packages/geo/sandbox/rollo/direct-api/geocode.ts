/**
 * Direct API probe — hits the legacy Google Geocoding API with
 * Rollo's iOS-app credentials. Kept as a historical record:
 * confirmed to return `REQUEST_DENIED` ("API is not activated"),
 * which is why `RolloGeocoder` puzzles forward geocoding up from
 * Text Search → Place Details instead of using this endpoint
 * directly. Re-run if Rollo ever expands their key's scope.
 *
 * Does NOT go through the @dashseller/geo adapter — this is a raw
 * probe.
 *
 * Example:
 *   bun run packages/geo/sandbox/rollo/direct-api/geocode.ts "1600 Amphitheatre Parkway, Mountain View, CA"
 *
 * Interpretation:
 *   status="REQUEST_DENIED" → Current state. Geocoding stays
 *                             puzzled-up via Text Search.
 *   status="OK"             → Rollo's key now authorizes Geocoding.
 *                             Could simplify `RolloGeocoder` to one
 *                             call.
 *   status="OVER_QUERY_LIMIT" → Authorized but rate-limited.
 *   HTTP 4xx                → Header/auth shape rejected. Investigate
 *                             headers (User-Agent? Host? Referer?).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const sandboxEnvPath = resolve(import.meta.dirname, "../../.env");
dotenv.config({ path: sandboxEnvPath });

const apiKey = process.env.ROLLO_API_KEY;
if (!apiKey) {
  console.error(`Missing ROLLO_API_KEY in ${sandboxEnvPath}`);
  process.exit(1);
}

const address = process.argv[2];
if (!address) {
  console.error(
    'Example: bun run packages/geo/sandbox/rollo/direct-api/geocode.ts "1600 Amphitheatre Parkway, Mountain View, CA"'
  );
  process.exit(1);
}

const params = new URLSearchParams({ address, key: apiKey });
const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

console.log("Probing legacy Geocoding API with Rollo credentials...");
console.log(`  address: ${address}\n`);

const response = await fetch(url, {
  method: "GET",
  headers: {
    "X-Ios-Bundle-Identifier": "com.rollo.app",
  },
});

const rawBody = await response.text();
const parsed = JSON.parse(rawBody) as {
  status: string;
  error_message?: string;
  results?: Array<{ formatted_address: string }>;
};

const safeName = address.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 60);
const outputFile = fileURLToPath(
  new URL(`./output/probe-${safeName}.json`, import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, rawBody);

console.log(`HTTP status:   ${response.status}`);
console.log(`Google status: ${parsed.status}`);
if (parsed.error_message) {
  console.log(`Error message: ${parsed.error_message}`);
}
const topResult = parsed.results?.[0];
if (topResult) {
  console.log(`Top result:    ${topResult.formatted_address}`);
}

console.log(`\nWrote ${outputFile}\n`);

if (parsed.status === "OK") {
  console.log(
    "✓ Rollo's key authorizes Geocoding API — safe to add a RolloGeocoder adapter."
  );
  process.exit(0);
}
if (parsed.status === "REQUEST_DENIED") {
  console.log(
    "✗ Rollo's key is NOT authorized for Geocoding API — geocoding stays Google-adapter exclusive."
  );
  process.exit(1);
}
console.log(
  `? Inconclusive status "${parsed.status}". Inspect the raw response above.`
);
process.exit(2);
