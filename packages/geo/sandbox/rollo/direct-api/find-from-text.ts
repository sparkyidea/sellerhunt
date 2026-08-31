/**
 * Direct legacy Google Places Find From Text call via Rollo's
 * iOS-app credentials. Dumps the raw JSON response.
 *
 * Find From Text differs from Text Search:
 *   - Returns up to 10 candidates (vs 20)
 *   - Caller specifies `fields` to control billing scope
 *   - Designed to match free-form text to ONE place rather than
 *     return a ranked list — useful when we want Google to commit
 *     to its best guess for a specific input
 *   - Response key is `candidates[]` (not `results[]`)
 *
 * Example:
 *   bun run packages/geo/sandbox/rollo/direct-api/find-from-text.ts "PO Box 741, Mc Camey, TX 79752"
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../setup";

const query = process.argv[2];
if (!query) {
  console.error(
    'Example: bun run packages/geo/sandbox/rollo/direct-api/find-from-text.ts "PO Box 741, Mc Camey, TX 79752"'
  );
  process.exit(1);
}

const config = getConfig();
const params = new URLSearchParams({
  fields: "place_id,formatted_address,geometry,name",
  input: query,
  inputtype: "textquery",
  key: config.apiKey,
  language: config.language ?? "en",
});
const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params.toString()}`;

console.log(`GET ${url.replace(config.apiKey, "***")}\n`);

const response = await fetch(url, {
  headers: { "X-Ios-Bundle-Identifier": "com.rollo.app" },
});

const rawBody = await response.text();
const safeName = query.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 60);
const outputFile = fileURLToPath(
  new URL(`./output/find-from-text-${safeName}.json`, import.meta.url)
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
  candidates?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
    name?: string;
    place_id?: string;
  }>;
  error_message?: string;
  status?: string;
}

const parsed = JSON.parse(rawBody) as RawResponse;
console.log(`status:           ${parsed.status ?? "—"}`);
console.log(`candidates:       ${parsed.candidates?.length ?? 0}`);
for (const [i, c] of (parsed.candidates ?? []).entries()) {
  console.log(`  [${i + 1}] place_id:  ${c.place_id ?? "—"}`);
  console.log(`      name:      ${c.name ?? "—"}`);
  console.log(`      formatted: ${c.formatted_address ?? "—"}`);
  if (c.geometry?.location) {
    console.log(
      `      location:  ${c.geometry.location.lat}, ${c.geometry.location.lng}`
    );
  }
}
if (parsed.error_message) {
  console.log(`error_message:    ${parsed.error_message}`);
}
process.exit(0);
