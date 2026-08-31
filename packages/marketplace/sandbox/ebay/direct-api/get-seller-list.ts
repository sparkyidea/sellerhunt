/**
 * Direct eBay Trading API call — GetSellerList
 * Dumps the raw response to see the actual data structure.
 *
 * Usage: bun run packages/marketplace/sandbox/ebay/direct-api/get-seller-list.ts
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

const creds = await getCredentials(channelId);
const client = createEbayApiClient(
  creds.clientId,
  creds.clientSecret,
  creds.accessToken,
  creds.refreshToken
);

console.log("Calling GetSellerList...\n");

const response = await client.trading.GetSellerList({
  Pagination: {
    EntriesPerPage: 5,
    PageNumber: 1,
  },
  GranularityLevel: "Fine",
  IncludeVariations: true,
  EndTimeFrom: new Date().toISOString(),
  EndTimeTo: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
});

// Write raw response to a JSON file for inspection
const outputFile = fileURLToPath(
  new URL("./output/get-seller-list.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(response, null, 2));

// Show first item's top-level keys
const items = response.ItemArray?.Item;
if (items) {
  const itemList = Array.isArray(items) ? items : [items];
  console.log(`\nItems returned: ${itemList.length}`);
  if (itemList[0]) {
    console.log(`First item keys: ${Object.keys(itemList[0]).join(", ")}`);
    console.log(
      `First item ItemID: ${itemList[0].ItemID} (type: ${typeof itemList[0].ItemID})`
    );
  }
}

process.exit(0);
