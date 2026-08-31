/**
 * Direct eBay Sell Fulfillment API call — getShippingFulfillments
 * Fetches raw fulfillment data for a single order.
 *
 * Usage: EBAY_ORDER_ID=12-14487-78679 bun run packages/marketplace/sandbox/ebay/direct-api/get-fulfillments.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
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

const orderId = "23-14471-28128";
if (!orderId) {
  console.error(
    "Set EBAY_ORDER_ID in sandbox/.env or pass via EBAY_ORDER_ID=<id> bun run <this-file>"
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

console.log(`Fetching fulfillments for order: ${orderId}\n`);

const fulfillments =
  await client.sell.fulfillment.getShippingFulfillments(orderId);

const count = fulfillments.fulfillments?.length ?? 0;
console.log(`Fulfillments: ${count}`);

for (const f of fulfillments.fulfillments ?? []) {
  console.log(
    `  - ${f.fulfillmentId} | ${f.shippingCarrierCode} | ${f.trackingNumber}`
  );
}

// Write output
const outputDir = fileURLToPath(new URL("./output/", import.meta.url));
await mkdir(outputDir, { recursive: true });

const outputFile = `${outputDir}get-fulfillments.json`;
await writeFile(outputFile, JSON.stringify(fulfillments, null, 2));

console.log(`\nRaw response written to: ${outputFile}`);

process.exit(0);
