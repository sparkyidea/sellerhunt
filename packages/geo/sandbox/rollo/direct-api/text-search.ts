/**
 * Direct legacy Google Places Text Search call via Rollo's iOS-app
 * credentials. Dumps the raw JSON response so we can confirm the
 * field shapes the mapper depends on (`results[].place_id`,
 * `results[].formatted_address`, `results[].geometry.location`).
 *
 * Note: Text Search returns up to 20 candidates with coords +
 * formatted_address + place_id, but NOT `address_components`. To
 * get structured components the `RolloGeocoder` follows up with
 * Place Details (see `adapter/geocode.ts`).
 *
 * Example:
 *   bun run packages/geo/sandbox/rollo/direct-api/text-search.ts "1600 Amphitheatre Parkway, Mountain View, CA"
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../setup";

const query = process.argv[2];
if (!query) {
  console.error(
    'Example: bun run packages/geo/sandbox/rollo/direct-api/text-search.ts "1600 Amphitheatre Parkway, Mountain View, CA"'
  );
  process.exit(1);
}

const config = getConfig();
const params = new URLSearchParams({
  key: config.apiKey,
  language: config.language ?? "en",
  query,
});
const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;

console.log(`GET ${url.replace(config.apiKey, "***")}\n`);

const response = await fetch(url, {
  headers: { "X-Ios-Bundle-Identifier": "com.rollo.app" },
});

const rawBody = await response.text();
const safeName = query.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 60);
const outputFile = fileURLToPath(
  new URL(`./output/text-search-${safeName}.json`, import.meta.url)
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
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
    place_id?: string;
  }>;
  status?: string;
}

const parsed = JSON.parse(rawBody) as RawResponse;
console.log(`status:           ${parsed.status ?? "—"}`);
console.log(`results:          ${parsed.results?.length ?? 0}`);
const top = parsed.results?.[0];
if (top) {
  console.log(`top placeId:      ${top.place_id ?? "—"}`);
  console.log(`top formatted:    ${top.formatted_address ?? "—"}`);
  if (top.geometry?.location) {
    console.log(
      `top location:     ${top.geometry.location.lat}, ${top.geometry.location.lng}`
    );
  }
}
if (parsed.error_message) {
  console.log(`error_message:    ${parsed.error_message}`);
}
process.exit(0);
