/**
 * Direct eBay Sell Fulfillment API call — getOrders
 * Dumps the raw response to see the actual data structure.
 *
 * Usage: bun run packages/marketplace/sandbox/ebay/direct-api/get-orders.ts
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

console.log("Calling sell.fulfillment.getOrders...\n");

const response = await client.sell.fulfillment.getOrders({
  limit: 100,
});

// Write raw response
const outputFile = fileURLToPath(
  new URL("./output/get-orders.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(response, null, 2));

console.log("Top-level keys:", Object.keys(response));
console.log("Total orders:", response.total);
console.log(`Orders returned: ${response.orders?.length ?? 0}`);

if (response.orders?.[0]) {
  console.log("\nFirst order keys:", Object.keys(response.orders[0]));
  console.log("First order ID:", response.orders[0].orderId);
  console.log("Fulfillment status:", response.orders[0].orderFulfillmentStatus);
  console.log("Line items:", response.orders[0].lineItems?.length ?? 0);
}

console.log(`\nRaw response written to: ${outputFile}`);
process.exit(0);
