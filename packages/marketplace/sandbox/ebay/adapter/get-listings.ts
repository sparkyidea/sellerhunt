/**
 * Adapter call — uses the marketplace factory to fetch listings
 * Demonstrates the opaque cursor pagination pattern.
 *
 * Usage:
 *   bun run packages/marketplace/sandbox/ebay/adapter/get-listings.ts
 *
 * Pass SINCE=<ISO-8601> to exercise the incremental watermark
 * (ModTimeFrom/ModTimeTo on GetSellerList). Example:
 *   SINCE=2026-04-29T00:00:00Z bun run .../get-listings.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiClient } from "../../../src";
import type { Listing } from "../../../src/types";
import { getCredentials } from "../setup";

const channelId = process.env.EBAY_CHANNEL_ID;
if (!channelId) {
  console.error(
    "Set EBAY_CHANNEL_ID in sandbox/.env or pass via EBAY_CHANNEL_ID=<id> bun run <this-file>"
  );
  process.exit(1);
}

const sinceRaw = process.env.SINCE;
let modifiedSince: Date | undefined;
if (sinceRaw) {
  modifiedSince = new Date(sinceRaw);
  if (Number.isNaN(modifiedSince.getTime())) {
    console.error(`Invalid SINCE value: ${sinceRaw}`);
    process.exit(1);
  }
}

const creds = await getCredentials(channelId);
const client = createApiClient("ebay", creds);

console.log("Calling getListings (adapter)...");
console.log(
  `  modifiedSince: ${modifiedSince?.toISOString() ?? "<full pull>"}\n`
);

const allListings: Listing[] = [];
let cursor: string | null = null;

do {
  const page = await client.getListings({
    cursor: cursor ?? undefined,
    modifiedSince,
  });
  allListings.push(...page.data);
  console.log(
    `  Page: ${page.data.length} listings (cursor: ${page.cursor ?? "done"})`
  );
  cursor = page.cursor;
} while (cursor);

// Write adapter output
const outputFile = fileURLToPath(
  new URL("./output/get-listings.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(allListings, null, 2));

console.log(`\nTotal listings: ${allListings.length}`);

for (const listing of allListings.slice(0, 5)) {
  console.log(
    `  - [${listing.reference}] ${listing.title} (${listing.status}, ${listing.listingVariants.length} variants)`
  );
}

if (allListings.length > 5) {
  console.log(`  ... and ${allListings.length - 5} more`);
}

process.exit(0);
