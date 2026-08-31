/**
 * Direct Places API (New) place-details call. Dumps the raw JSON
 * response so we can confirm the field shapes the mapper depends on
 * (`id`, `formattedAddress`, `addressComponents[]`,
 * `location.latitude`, `location.longitude`).
 *
 * `sessionToken` is optional — pass it (matching the token used by
 * a preceding `suggest` call) to close the billed Autocomplete
 * session. Omit for standalone lookups.
 *
 * Example:
 *   bun run packages/geo/sandbox/google/direct-api/get-place-details.ts ChIJj61dQgK6j4AR4GeTYWZsKWw
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../setup";

const placeId = process.argv[2];
const sessionToken = process.argv[3];
if (!placeId) {
  console.error(
    "Example: bun run packages/geo/sandbox/google/direct-api/get-place-details.ts ChIJj61dQgK6j4AR4GeTYWZsKWw"
  );
  process.exit(1);
}

const config = getConfig();
const params = new URLSearchParams({ languageCode: config.language ?? "en" });
if (sessionToken) {
  params.set("sessionToken", sessionToken);
}
const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params.toString()}`;

if (sessionToken) {
  console.log(`GET ${url} (session ${sessionToken})\n`);
} else {
  console.log(`GET ${url} (standalone — no session to close)\n`);
}

const response = await fetch(url, {
  headers: {
    "X-Goog-Api-Key": config.apiKey,
    "X-Goog-FieldMask": "id,formattedAddress,addressComponents,location",
  },
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
  addressComponents?: Array<{ types: string[] }>;
  formattedAddress?: string;
  id?: string;
  location?: { latitude: number; longitude: number };
}

const parsed = JSON.parse(rawBody) as RawResponse;
console.log(`id:               ${parsed.id ?? "—"}`);
console.log(`formattedAddress: ${parsed.formattedAddress ?? "—"}`);
console.log(
  `location:         ${parsed.location ? `${parsed.location.latitude}, ${parsed.location.longitude}` : "—"}`
);
console.log(
  `addressComponents:${parsed.addressComponents?.length ?? 0} entries`
);
process.exit(0);
