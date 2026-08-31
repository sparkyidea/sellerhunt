/**
 * Adapter call — uses the marketplace factory to fetch normalized Shopify
 * fulfillments for one order. Verifies factory → ShopifyApiClient →
 * get-fulfillments → map-fulfillment → ShippingFulfillment[].
 *
 * Pass an order ID via ORDER_ID env var. Defaults to the first order from the
 * dev store if unset.
 *
 * Usage: ORDER_ID=gid://shopify/Order/123 bun run packages/marketplace/sandbox/shopify/adapter/get-fulfillments.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiClient } from "../../../src";
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

let orderId = process.env.ORDER_ID;
if (!orderId) {
  const page = await client.getOrders();
  orderId = page.data[0]?.reference;
  if (!orderId) {
    console.error(
      "No orders found in the dev store and ORDER_ID not provided."
    );
    process.exit(1);
  }
  console.log(`Using order: ${orderId}\n`);
}

console.log(`Calling getFulfillments (adapter) for ${orderId}...\n`);
const fulfillments = await client.getFulfillments(orderId);

const outputFile = fileURLToPath(
  new URL("./output/get-fulfillments.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(fulfillments, null, 2));

console.log(`Fulfillments: ${fulfillments.length}`);
for (const fulfillment of fulfillments.slice(0, 5)) {
  console.log(
    `  - [${fulfillment.reference}] carrier=${fulfillment.carrier ?? "(none)"} tracking=${fulfillment.tracking ?? "(none)"} lines=${fulfillment.lineItems.length} shippedAt=${fulfillment.shippedAt ?? "(none)"}`
  );
}

process.exit(0);
