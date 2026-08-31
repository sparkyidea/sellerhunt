/**
 * Adapter call — resolve a Suggestion's placeId to full
 * `PlaceDetails` through the Rollo adapter. Closes the billed
 * Autocomplete session when paired with the sessionToken used by
 * the preceding `suggest` calls.
 *
 * Usage:
 *   bun run packages/geo/sandbox/rollo/adapter/get-place-details.ts <placeId> <sessionToken>
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createAutocomplete } from "../../../src/index";
import { getConfig } from "../setup";

const placeId = process.argv[2];
const sessionToken = process.argv[3];
if (!placeId) {
  console.error(
    "Example: bun run packages/geo/sandbox/rollo/adapter/get-place-details.ts ChIJBdz-ggNbwokRbIEsjVaXrtU"
  );
  process.exit(1);
}

const autocomplete = createAutocomplete("rollo", getConfig());

if (sessionToken) {
  console.log(`Resolving ${placeId} (session ${sessionToken})...\n`);
} else {
  console.log(
    `Resolving ${placeId} (standalone lookup — no session to close)...\n`
  );
}

const details = await autocomplete.getPlaceDetails(placeId, sessionToken);

const safeName = placeId.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 60);
const outputFile = fileURLToPath(
  new URL(`./output/details-${safeName}.json`, import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(details, null, 2));

console.log(`placeId:         ${details.placeId}`);
console.log(`latitude:        ${details.latitude}`);
console.log(`longitude:       ${details.longitude}`);
console.log(`formatted:       ${details.formattedAddress}`);
console.log("address:");
console.log(`  address1:      ${details.address.address1 ?? "—"}`);
console.log(`  address2:      ${details.address.address2 ?? "—"}`);
console.log(`  city:          ${details.address.city ?? "—"}`);
console.log(`  state:         ${details.address.state ?? "—"}`);
console.log(`  zipcode:       ${details.address.zipcode ?? "—"}`);
console.log(`  country:       ${details.address.country ?? "—"}`);
console.log(`\nWrote ${outputFile}`);
process.exit(0);
