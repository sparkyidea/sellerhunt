/**
 * Fetch specific orders by ID and dump their cancelStatus fields.
 *
 * Usage: bun run packages/marketplace/sandbox/ebay/direct-api/get-order-by-id.ts
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

const ORDER_IDS = ["24-14467-96712", "05-14480-76857", "02-14485-76007"];

const creds = await getCredentials(channelId);
const client = createEbayApiClient(
  creds.clientId,
  creds.clientSecret,
  creds.accessToken,
  creds.refreshToken
);

for (const orderId of ORDER_IDS) {
  console.log(`\n--- Fetching order: ${orderId} ---`);
  try {
    const order = await client.sell.fulfillment.getOrder(orderId);

    console.log("orderId:", order.orderId);
    console.log("orderFulfillmentStatus:", order.orderFulfillmentStatus);
    console.log("orderPaymentStatus:", order.orderPaymentStatus);
    console.log("cancelStatus:", JSON.stringify(order.cancelStatus, null, 2));
    console.log(
      "cancelRequests:",
      JSON.stringify(order.cancelStatus?.cancelRequests, null, 2)
    );

    // Write full raw response
    const outputFile = fileURLToPath(
      new URL(`./output/order-${orderId}.json`, import.meta.url)
    );
    await mkdir(dirname(outputFile), { recursive: true });
    await writeFile(outputFile, JSON.stringify(order, null, 2));
    console.log(`Raw response written to: ${outputFile}`);
  } catch (error) {
    console.error(`Failed to fetch order ${orderId}:`, error);
  }
}

process.exit(0);
