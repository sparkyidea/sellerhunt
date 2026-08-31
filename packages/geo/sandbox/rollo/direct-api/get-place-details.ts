/**
 * Direct legacy Google Places details call via Rollo's iOS-app
 * credentials. Dumps the raw JSON response so we can confirm the
 * field shapes the mapper depends on (`result.place_id`,
 * `result.formatted_address`, `result.address_components`,
 * `result.geometry.location.lat`, `result.geometry.location.lng`).
 *
 * `sessionToken` is optional — pass it (matching the token used by
 * a preceding `suggest` call) to close the billed Autocomplete
 * session. Omit for standalone lookups.
 *
 * Example:
 *   bun run packages/geo/sandbox/rollo/direct-api/get-place-details.ts ChIJBdz-ggNbwokRbIEsjVaXrtU
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../setup";

const placeId = process.argv[2];
const sessionToken = process.argv[3];
if (!placeId) {
  console.error(
    "Example: bun run packages/geo/sandbox/rollo/direct-api/get-place-details.ts ChIJBdz-ggNbwokRbIEsjVaXrtU"
  );
  process.exit(1);
}

const config = getConfig();
const params = new URLSearchParams({
  fields: "address_components,formatted_address,geometry/location,place_id",
  key: config.apiKey,
  language: config.language ?? "en",
  placeid: placeId,
});
if (sessionToken) {
  params.set("sessiontoken", sessionToken);
}
const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;

if (sessionToken) {
  console.log(
    `GET ${url.replace(config.apiKey, "***")} (session ${sessionToken})\n`
  );
} else {
  console.log(
    `GET ${url.replace(config.apiKey, "***")} (standalone — no session to close)\n`
  );
}

const response = await fetch(url, {
  headers: { "X-Ios-Bundle-Identifier": "com.rollo.app" },
});

const rawBody = await response.text();
const safeName = placeId.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 60);
const outputFile = fileURLToPath(
  new URL(`./output/details-${safeName}.json`, import.meta.url)
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
  result?: {
    address_components?: Array<{ types: string[] }>;
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
    place_id?: string;
  };
  status?: string;
}

const parsed = JSON.parse(rawBody) as RawResponse;
console.log(`status:           ${parsed.status ?? "—"}`);
console.log(`place_id:         ${parsed.result?.place_id ?? "—"}`);
console.log(`formatted:        ${parsed.result?.formatted_address ?? "—"}`);
const loc = parsed.result?.geometry?.location;
console.log(`location:         ${loc ? `${loc.lat}, ${loc.lng}` : "—"}`);
console.log(
  `address_components: ${parsed.result?.address_components?.length ?? 0} entries`
);
if (parsed.error_message) {
  console.log(`error_message:    ${parsed.error_message}`);
}
process.exit(0);
