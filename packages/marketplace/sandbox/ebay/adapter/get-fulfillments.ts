/**
 * Adapter call — fetch fulfillments for orders.
 * Validates that getFulfillments returns normalized data
 * we can use to create local shipment records during pull.
 *
 * Usage:
 *   EBAY_CHANNEL_ID=<id> bun run packages/marketplace/sandbox/ebay/adapter/get-fulfillments.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiClient } from "../../../src";
import type { Order, ShippingFulfillment } from "../../../src/types";
import { getCredentials } from "../setup";

const channelId = process.env.EBAY_CHANNEL_ID;
if (!channelId) {
  console.error(
    "Set EBAY_CHANNEL_ID in sandbox/.env or pass via EBAY_CHANNEL_ID=<id> bun run <this-file>"
  );
  process.exit(1);
}

const creds = await getCredentials(channelId);
const client = createApiClient("ebay", creds);

// Step 1: Pull a page of orders to find shipped ones
console.log("=== Step 1: Find shipped orders ===");
const page = await client.getOrders();

let shippedOrders = page.data.filter(
  (o) =>
    o.shipped ||
    o.status === "fulfilled" ||
    o.status === "partially_fulfilled" ||
    o.status === "completed"
);
console.log(
  `Total orders: ${page.data.length}, Shipped: ${shippedOrders.length}`
);

if (shippedOrders.length === 0) {
  console.log("No shipped orders found. Trying first 5 orders as fallback...");
  shippedOrders = page.data.slice(0, 5);
}

// Step 2: Fetch fulfillments for each shipped order
console.log("\n=== Step 2: Fetch fulfillments per order ===");

const results: Array<{
  order: Pick<Order, "reference" | "status" | "shipped" | "orderLines">;
  fulfillments: ShippingFulfillment[];
}> = [];

for (const order of shippedOrders.slice(0, 5)) {
  console.log(
    `  Order: ${order.reference} (status: ${order.status}, shipped: ${order.shipped}) — ${order.orderLines.length} lines`
  );

  const fulfillments = await client.getFulfillments(order.reference);
  console.log(`    Fulfillments: ${fulfillments.length}`);

  for (const f of fulfillments) {
    console.log(
      `    - ${f.reference} | ${f.carrier} | ${f.tracking} | shipped: ${f.shippedAt}`
    );
  }

  results.push({
    order: {
      reference: order.reference,
      status: order.status,
      shipped: order.shipped,
      orderLines: order.orderLines,
    },
    fulfillments,
  });
}

// Write output
const outputFile = fileURLToPath(
  new URL("./output/get-fulfillments.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(results, null, 2));

const totalFulfillments = results.reduce(
  (sum, r) => sum + r.fulfillments.length,
  0
);
console.log(
  `\nTotal: ${results.length} orders, ${totalFulfillments} fulfillments`
);
console.log(`Output written to ${outputFile}`);

process.exit(0);
