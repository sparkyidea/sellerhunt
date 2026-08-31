/**
 * Direct Google Geocoding API call (forward). Dumps the raw JSON
 * response so we can confirm the field shapes the mapper depends on
 * (`results[].address_components`, `results[].geometry.location`,
 * `results[].formatted_address`, `results[].place_id`).
 *
 * No imports from `src/` — pure provider call, byte-faithful
 * snapshot of what Google returns.
 *
 * Example:
 *   bun run packages/geo/sandbox/google/direct-api/geocode.ts "1600 Amphitheatre Parkway, Mountain View, CA"
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../setup";

const address = process.argv[2];
if (!address) {
  console.error(
    'Example: bun run packages/geo/sandbox/google/direct-api/geocode.ts "1600 Amphitheatre Parkway, Mountain View, CA"'
  );
  process.exit(1);
}

const config = getConfig();
const params = new URLSearchParams({
  address,
  key: config.apiKey,
  language: config.language ?? "en",
});
const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

console.log(`GET ${url.replace(config.apiKey, "***")}\n`);

const response = await fetch(url, { method: "GET" });
const rawBody = await response.text();

const safeName = address.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 60);
const outputFile = fileURLToPath(
  new URL(`./output/geocode-${safeName}.json`, import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, rawBody);

console.log(`HTTP ${response.status} ${response.statusText}`);
console.log(`Wrote ${outputFile}\n`);

if (!response.ok) {
  console.error(rawBody.slice(0, 500));
  process.exit(1);
}

interface RawResponse {
  error_message?: string;
  results?: Array<{ formatted_address: string; place_id: string }>;
  status?: string;
}

const parsed = JSON.parse(rawBody) as RawResponse;
console.log(`status:           ${parsed.status ?? "—"}`);
console.log(`results:          ${parsed.results?.length ?? 0}`);
if (parsed.results?.[0]) {
  console.log(`top placeId:      ${parsed.results[0].place_id}`);
  console.log(`top formatted:    ${parsed.results[0].formatted_address}`);
}
if (parsed.error_message) {
  console.log(`error_message:    ${parsed.error_message}`);
}
process.exit(0);
