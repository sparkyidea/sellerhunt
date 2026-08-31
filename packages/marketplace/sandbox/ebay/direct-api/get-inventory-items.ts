/**
 * Direct eBay Sell Inventory API — getInventoryItems
 * Fetches inventory items via the REST Inventory API (alternative to Trading API).
 *
 * Usage: bun run packages/marketplace/sandbox/ebay/direct-api/get-inventory-items.ts
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

console.log("Calling sell.inventory.getInventoryItems...\n");

const response = await client.sell.inventory.getInventoryItems({
  limit: 10,
  offset: 0,
});

const outputFile = fileURLToPath(
  new URL("./output/get-inventory-items.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(response, null, 2));

console.log("Top-level keys:", Object.keys(response));
console.log("Total:", response.total);
console.log("Size:", response.size);

const items = response.inventoryItems;
if (Array.isArray(items) && items.length > 0) {
  console.log(`\nInventory items returned: ${items.length}`);
  console.log("First item keys:", Object.keys(items[0]));
  console.log("First item SKU:", items[0].sku);
  console.log(
    "First item product:",
    JSON.stringify(items[0].product?.title ?? "(no title)")
  );
  console.log(
    "First item availability:",
    JSON.stringify(items[0].availability)
  );
} else {
  console.log("\nNo inventory items returned.");
  console.log(
    "(Sellers using Trading API only may not have REST inventory items)"
  );
}

console.log(`\nRaw response written to: ${outputFile}`);
process.exit(0);
