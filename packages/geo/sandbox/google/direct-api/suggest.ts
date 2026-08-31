/**
 * Direct Places API (New) autocomplete call. Dumps the raw JSON
 * response so we can confirm the field shapes the mapper depends on
 * (`suggestions[].placePrediction.placeId`,
 * `suggestions[].placePrediction.structuredFormat.mainText.text`,
 * `suggestions[].placePrediction.structuredFormat.secondaryText.text`).
 *
 * Generates a fresh sessionToken (UUID v4) and prints it so you can
 * reuse it with `direct-api/get-place-details.ts`.
 *
 * Example:
 *   bun run packages/geo/sandbox/google/direct-api/suggest.ts "1600 amph" us
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../setup";

const query = process.argv[2];
if (!query) {
  console.error(
    'Example: bun run packages/geo/sandbox/google/direct-api/suggest.ts "1600 amph" us'
  );
  process.exit(1);
}

const countries = (process.argv[3] ?? "us")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

const sessionToken = randomUUID();
const config = getConfig();
const url = "https://places.googleapis.com/v1/places:autocomplete";

const body = {
  includedRegionCodes: countries,
  input: query,
  languageCode: config.language ?? "en",
  sessionToken,
};

console.log(`POST ${url}`);
console.log(`sessionToken: ${sessionToken}\n`);

const response = await fetch(url, {
  body: JSON.stringify(body),
  headers: {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": config.apiKey,
    "X-Goog-FieldMask":
      "suggestions.placePrediction.placeId," +
      "suggestions.placePrediction.structuredFormat.mainText," +
      "suggestions.placePrediction.structuredFormat.secondaryText",
  },
  method: "POST",
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
  suggestions?: Array<{
    placePrediction?: {
      placeId: string;
      structuredFormat?: {
        mainText?: { text: string };
        secondaryText?: { text: string };
      };
    };
  }>;
}

const parsed = JSON.parse(rawBody) as RawResponse;
const placePredictions = (parsed.suggestions ?? [])
  .map((s) => s.placePrediction)
  .filter((p): p is NonNullable<typeof p> => p !== undefined);

console.log(`placePredictions: ${placePredictions.length}`);
if (placePredictions[0]?.structuredFormat) {
  console.log(
    `top mainText:     ${placePredictions[0].structuredFormat.mainText?.text ?? "—"}`
  );
  console.log(`top placeId:      ${placePredictions[0].placeId}`);
}
console.log(
  `\nResolve a suggestion:\n  bun run packages/geo/sandbox/google/direct-api/get-place-details.ts <placeId> ${sessionToken}`
);
process.exit(0);
