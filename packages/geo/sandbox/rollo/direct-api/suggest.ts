/**
 * Direct legacy Google Places autocomplete call via Rollo's iOS-app
 * credentials. Dumps the raw JSON response so we can confirm the
 * field shapes the mapper depends on (`predictions[].place_id`,
 * `predictions[].structured_formatting.main_text`,
 * `predictions[].structured_formatting.secondary_text`).
 *
 * Generates a fresh sessionToken (UUID v4) and prints it so you can
 * reuse it with `direct-api/get-place-details.ts`.
 *
 * Example:
 *   bun run packages/geo/sandbox/rollo/direct-api/suggest.ts "520 8th av brooklyn" us
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../setup";

const query = process.argv[2];
if (!query) {
  console.error(
    'Example: bun run packages/geo/sandbox/rollo/direct-api/suggest.ts "520 8th av brooklyn" us'
  );
  process.exit(1);
}

const countries = (process.argv[3] ?? "us")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

const sessionToken = randomUUID();
const config = getConfig();

const params = new URLSearchParams({
  input: query,
  key: config.apiKey,
  language: config.language ?? "en",
  sessiontoken: sessionToken,
  types: "address",
});
if (countries.length > 0) {
  params.set("components", countries.map((c) => `country:${c}`).join("|"));
}
const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;

console.log(`GET ${url.replace(config.apiKey, "***")}`);
console.log(`sessionToken: ${sessionToken}\n`);

const response = await fetch(url, {
  headers: { "X-Ios-Bundle-Identifier": "com.rollo.app" },
});

const rawBody = await response.text();
const safeName = query.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 60);
const outputFile = fileURLToPath(
  new URL(`./output/suggest-${safeName}.json`, import.meta.url)
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
  predictions?: Array<{
    description?: string;
    place_id: string;
    structured_formatting?: {
      main_text?: string;
      secondary_text?: string;
    };
  }>;
  status?: string;
}

const parsed = JSON.parse(rawBody) as RawResponse;
console.log(`status:           ${parsed.status ?? "—"}`);
console.log(`predictions:      ${parsed.predictions?.length ?? 0}`);
if (parsed.predictions?.[0]) {
  console.log(
    `top main_text:    ${parsed.predictions[0].structured_formatting?.main_text ?? "—"}`
  );
  console.log(`top place_id:     ${parsed.predictions[0].place_id}`);
}
if (parsed.error_message) {
  console.log(`error_message:    ${parsed.error_message}`);
}
console.log(
  `\nResolve a suggestion:\n  bun run packages/geo/sandbox/rollo/direct-api/get-place-details.ts <placeId> ${sessionToken}`
);
process.exit(0);
