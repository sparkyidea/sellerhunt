/**
 * Direct eBay Trading API call — GetSellerEvents
 * Returns items modified within a time window (max 48h).
 * Used by the listings adapter for incremental sync.
 *
 * Usage:
 *   bun run packages/marketplace/sandbox/ebay/direct-api/get-seller-events.ts
 *
 * Pass SINCE=<ISO-8601> to set ModTimeFrom; defaults to 40h ago.
 *   SINCE=2026-04-29T00:00:00Z bun run .../get-seller-events.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createEbayApiClient } from "../../../src/adapters/ebay/create-ebay-client";
import { getCredentials } from "../setup";

const channelId = process.env.EBAY_CHANNEL_ID;
if (!channelId) {
  console.error(
    "Set EBAY_CHANNEL_ID in sandbox/.env or pass via EBAY_CHANNEL_ID=<id> bun run <this-file>"
  );
  process.exit(1);
}

const NOW = new Date();
const sinceRaw = process.env.SINCE;
let modTimeFrom: Date;
if (sinceRaw) {
  modTimeFrom = new Date(sinceRaw);
  if (Number.isNaN(modTimeFrom.getTime())) {
    console.error(`Invalid SINCE: ${sinceRaw}`);
    process.exit(1);
  }
} else {
  modTimeFrom = new Date(NOW.getTime() - 40 * 60 * 60 * 1000);
}

const creds = await getCredentials(channelId);
const client = createEbayApiClient(
  creds.clientId,
  creds.clientSecret,
  creds.accessToken,
  creds.refreshToken
);

console.log("Calling trading.GetSellerEvents...");
console.log(`  ModTimeFrom: ${modTimeFrom.toISOString()}`);
console.log(`  ModTimeTo:   ${NOW.toISOString()}\n`);

const response = await client.trading.GetSellerEvents({
  ModTimeFrom: modTimeFrom.toISOString(),
  ModTimeTo: NOW.toISOString(),
});

const outputFile = fileURLToPath(
  new URL("./output/get-seller-events.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(response, null, 2));

console.log("Top-level keys:", Object.keys(response));

const itemArray = (response as { ItemArray?: { Item?: unknown } }).ItemArray;
const rawItem = itemArray?.Item;
let items: Record<string, unknown>[] = [];
if (Array.isArray(rawItem)) {
  items = rawItem as Record<string, unknown>[];
} else if (rawItem) {
  items = [rawItem as Record<string, unknown>];
}

console.log(`Items returned: ${items.length}`);

if (items[0]) {
  console.log("\nFirst item top-level keys:", Object.keys(items[0]));
  console.log("Sample:");
  console.log(`  ItemID: ${items[0].ItemID}`);
  console.log(`  Title:  ${items[0].Title}`);
  const sellingStatus = items[0].SellingStatus as
    | { ListingStatus?: string; QuantitySold?: number; CurrentPrice?: unknown }
    | undefined;
  if (sellingStatus) {
    console.log(`  ListingStatus: ${sellingStatus.ListingStatus}`);
    console.log(`  QuantitySold:  ${sellingStatus.QuantitySold}`);
  }
  const listingDetails = items[0].ListingDetails as
    | { StartTime?: string; EndTime?: string }
    | undefined;
  if (listingDetails) {
    console.log(`  StartTime: ${listingDetails.StartTime}`);
    console.log(`  EndTime:   ${listingDetails.EndTime}`);
  }
}

console.log(`\nFull response written to: ${outputFile}`);
process.exit(0);
