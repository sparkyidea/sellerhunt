/**
 * Adapter call — fetch autocomplete suggestions through the Rollo
 * adapter (legacy Google Places API proxied via Rollo's iOS-app
 * credentials). Generates a fresh session token and prints it so
 * you can reuse it with `get-place-details.ts`.
 *
 * Usage:
 *   bun run packages/geo/sandbox/rollo/adapter/suggest.ts "<query>" [country,country,...]
 *
 * Examples:
 *   bun run packages/geo/sandbox/rollo/adapter/suggest.ts "520 8th av brooklyn" us
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createAutocomplete } from "../../../src/index";
import { getConfig } from "../setup";

const query = process.argv[2];
if (!query) {
  console.error(
    'Example: bun run packages/geo/sandbox/rollo/adapter/suggest.ts "520 8th av brooklyn" us'
  );
  process.exit(1);
}

const countries = (process.argv[3] ?? "us")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

const sessionToken = randomUUID();
const autocomplete = createAutocomplete("rollo", getConfig());

console.log(`Suggesting "${query}" (countries: ${countries.join(", ")})`);
console.log(`sessionToken: ${sessionToken}\n`);

const suggestions = await autocomplete.suggest(query, sessionToken, {
  countries,
});

const safeName = query.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 60);
const outputFile = fileURLToPath(
  new URL(`./output/suggest-${safeName}.json`, import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(
  outputFile,
  JSON.stringify({ sessionToken, suggestions }, null, 2)
);

console.log(`${suggestions.length} suggestion(s):\n`);
for (const [i, s] of suggestions.entries()) {
  console.log(`  ${i + 1}. ${s.mainText}`);
  console.log(`     ${s.secondaryText}`);
  console.log(`     placeId: ${s.placeId}`);
}

console.log(`\nWrote ${outputFile}`);
console.log(
  `\nResolve a suggestion:\n  bun run packages/geo/sandbox/rollo/adapter/get-place-details.ts <placeId> ${sessionToken}`
);
process.exit(0);
