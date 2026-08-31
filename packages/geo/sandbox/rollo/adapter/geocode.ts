/**
 * Adapter call — forward-geocode through the Rollo adapter. Runs
 * the two-call pipeline (Text Search → Place Details) and applies
 * strict zipcode/state verification against the input.
 *
 * Usage:
 *   bun run packages/geo/sandbox/rollo/adapter/geocode.ts \
 *     '{"address1":"1600 Amphitheatre Parkway","city":"Mountain View","state":"CA","zipcode":"94043","country":"US"}'
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createGeocoder } from "../../../src/index";
import type { Address } from "../../../src/types";
import { getConfig } from "../setup";

const arg = process.argv[2];
if (!arg) {
  console.error(
    'Example: bun run packages/geo/sandbox/rollo/adapter/geocode.ts \'{"address1":"1600 Amphitheatre Parkway","city":"Mountain View","state":"CA","zipcode":"94043","country":"US"}\''
  );
  process.exit(1);
}

let input: Partial<Address>;
try {
  input = JSON.parse(arg) as Partial<Address>;
} catch {
  console.error("address arg must be valid JSON");
  process.exit(1);
}

const geocoder = createGeocoder("rollo", getConfig());

console.log(`Geocoding ${JSON.stringify(input)}...\n`);

const result = await geocoder.geocode(input);

const safeName = (input.address1 ?? input.city ?? "result")
  .replace(/[^a-zA-Z0-9]+/g, "_")
  .slice(0, 60);
const outputFile = fileURLToPath(
  new URL(`./output/geocode-${safeName}.json`, import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(result, null, 2));

if (!result) {
  console.log(
    "status:          NULL (zero results or strict-verification rejected the top match)"
  );
  console.log(`\nWrote ${outputFile}`);
  process.exit(0);
}

console.log(`placeId:         ${result.placeId}`);
console.log(`latitude:        ${result.latitude}`);
console.log(`longitude:       ${result.longitude}`);
console.log(`formatted:       ${result.formattedAddress}`);
console.log("address:");
console.log(`  address1:      ${result.address.address1 ?? "—"}`);
console.log(`  address2:      ${result.address.address2 ?? "—"}`);
console.log(`  city:          ${result.address.city ?? "—"}`);
console.log(`  state:         ${result.address.state ?? "—"}`);
console.log(`  zipcode:       ${result.address.zipcode ?? "—"}`);
console.log(`  country:       ${result.address.country ?? "—"}`);
console.log(`\nWrote ${outputFile}`);
process.exit(0);
