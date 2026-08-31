/**
 * Adapter call — uses the shipment-tracking factory to fetch a normalized
 * `Tracking` for a tracking number. Output is upsert-ready against the
 * `tracking` table in `@dashseller/db`.
 *
 * Usage:
 *   bun run packages/shipment-tracking/sandbox/package-tracker/adapter/track.ts <tracking_number>
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createTrackingClient } from "../../../src/index";
import { getConfig } from "../setup";

const trackingNumber = process.argv[2];
if (!trackingNumber) {
  console.error(
    "Usage: bun run packages/shipment-tracking/sandbox/package-tracker/adapter/track.ts <tracking_number>"
  );
  process.exit(1);
}

const client = createTrackingClient(getConfig());

console.log(`Calling track (adapter) for ${trackingNumber}...\n`);

const result = await client.track({ trackingNumber });

const outputFile = fileURLToPath(
  new URL(`./output/track-${trackingNumber}.json`, import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(result, null, 2));

const latest = result.history.at(-1);
console.log(`provider:       ${result.provider}`);
console.log(`status:         ${result.status}`);
console.log(`substatus:      ${latest?.substatus ?? "—"}`);
console.log(`statusDate:     ${latest?.statusDate.toISOString() ?? "—"}`);
console.log(`statusDetails:  ${latest?.statusDetails ?? "—"}`);
console.log(`eta:            ${result.eta?.toISOString() ?? "—"}`);
console.log(`history events: ${result.history.length}`);

if (latest) {
  const where = latest.locationCity
    ? `${latest.locationCity}, ${latest.locationState ?? ""}`
    : "—";
  console.log("\nlatest event:");
  console.log(
    `  ${latest.statusDate.toISOString()}  ${latest.status}/${latest.substatus ?? "—"}  (${where})`
  );
  if (latest.statusDetails) {
    console.log(`  ${latest.statusDetails}`);
  }
}

console.log(`\nWrote ${outputFile}`);
process.exit(0);
