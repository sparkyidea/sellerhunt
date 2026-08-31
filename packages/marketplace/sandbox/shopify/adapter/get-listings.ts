/**
 * Adapter call — uses the marketplace factory to fetch normalized Shopify
 * listings. Verifies the full path: factory → ShopifyApiClient → get-listings →
 * map-listing → Listing[].
 *
 * Usage: bun run packages/marketplace/sandbox/shopify/adapter/get-listings.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiClient } from "../../../src";
import type { Listing } from "../../../src/types";
import { getCredentials } from "../setup";

const channelId = process.env.SHOPIFY_CHANNEL_ID;
if (!channelId) {
  console.error(
    "Set SHOPIFY_CHANNEL_ID in sandbox/.env or pass via SHOPIFY_CHANNEL_ID=<id> bun run <this-file>"
  );
  process.exit(1);
}

const creds = await getCredentials(channelId);
const client = createApiClient("shopify", creds);

console.log(`Calling getListings (adapter) against ${creds.shopUrl}...\n`);

const allListings: Listing[] = [];
let cursor: string | null = null;

do {
  const page = await client.getListings({ cursor: cursor ?? undefined });
  allListings.push(...page.data);
  console.log(
    `  Page: ${page.data.length} listings (cursor: ${page.cursor ?? "done"})`
  );
  cursor = page.cursor;
} while (cursor);

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
