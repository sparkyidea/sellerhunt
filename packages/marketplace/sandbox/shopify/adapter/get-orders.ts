/**
 * Adapter call — uses the marketplace factory to fetch normalized Shopify
 * orders. Verifies factory → ShopifyApiClient → get-orders → map-order →
 * Order[].
 *
 * Usage: bun run packages/marketplace/sandbox/shopify/adapter/get-orders.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiClient } from "../../../src";
import type { Order } from "../../../src/types";
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

console.log(`Calling getOrders (adapter) against ${creds.shopUrl}...\n`);

const allOrders: Order[] = [];
let cursor: string | null = null;

do {
  const page = await client.getOrders({ cursor: cursor ?? undefined });
  allOrders.push(...page.data);
  console.log(
    `  Page: ${page.data.length} orders (cursor: ${page.cursor ?? "done"})`
  );
  cursor = page.cursor;
} while (cursor);

const outputFile = fileURLToPath(
  new URL("./output/get-orders.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(allOrders, null, 2));

console.log(`\nTotal orders: ${allOrders.length}`);

for (const order of allOrders.slice(0, 5)) {
  console.log(
    `  - [${order.reference}] ${order.orderNumber} (${order.status}, paid=${order.paid}, ${order.orderLines.length} lines, total=${order.total})`
  );
}

if (allOrders.length > 5) {
  console.log(`  ... and ${allOrders.length - 5} more`);
}

process.exit(0);
