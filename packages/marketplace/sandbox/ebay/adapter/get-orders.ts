/**
 * Adapter call — uses the marketplace factory to fetch orders
 * Demonstrates the opaque cursor pagination pattern.
 *
 * Usage:
 *   bun run packages/marketplace/sandbox/ebay/adapter/get-orders.ts
 *
 * Pass SINCE=<ISO-8601> to exercise the incremental watermark
 * (lastmodifieddate filter). Example:
 *   SINCE=2026-04-29T00:00:00Z bun run .../get-orders.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiClient } from "../../../src";
import type { Order } from "../../../src/types";
import { getCredentials } from "../setup";

const channelId = process.env.EBAY_CHANNEL_ID;
if (!channelId) {
  console.error(
    "Set EBAY_CHANNEL_ID in sandbox/.env or pass via EBAY_CHANNEL_ID=<id> bun run <this-file>"
  );
  process.exit(1);
}

const sinceRaw = process.env.SINCE;
let since: Date | undefined;
if (sinceRaw) {
  since = new Date(sinceRaw);
  if (Number.isNaN(since.getTime())) {
    console.error(`Invalid SINCE value: ${sinceRaw}`);
    process.exit(1);
  }
}

const creds = await getCredentials(channelId);
const client = createApiClient("ebay", creds);

console.log("Calling getOrders (adapter)...");
console.log(`  since: ${since?.toISOString() ?? "<full pull>"}\n`);

const allOrders: Order[] = [];
let cursor: string | null = null;

do {
  const page = await client.getOrders({
    cursor: cursor ?? undefined,
    since,
  });
  allOrders.push(...page.data);
  console.log(
    `  Page: ${page.data.length} orders (cursor: ${page.cursor ?? "done"})`
  );
  cursor = page.cursor;
} while (cursor);

// Write adapter output
const outputFile = fileURLToPath(
  new URL("./output/get-orders.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(allOrders, null, 2));

console.log(`\nTotal orders: ${allOrders.length}`);

for (const order of allOrders.slice(0, 5)) {
  console.log(
    `  - [${order.reference}] ${order.customerUsername} — ${order.status} — $${((order.total ?? 0) / 100).toFixed(2)}`
  );
}

if (allOrders.length > 5) {
  console.log(`  ... and ${allOrders.length - 5} more`);
}

process.exit(0);
