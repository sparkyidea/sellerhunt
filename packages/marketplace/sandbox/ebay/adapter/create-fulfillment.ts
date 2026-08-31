/**
 * Adapter call — uses the marketplace factory to create a fulfillment.
 * Tests the full adapter flow: getFulfillments → createFulfillment → verify.
 *
 * Usage:
 *   EBAY_CHANNEL_ID=<id> bun run packages/marketplace/sandbox/ebay/adapter/create-fulfillment.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiClient } from "../../../src";
import { getCredentials } from "../setup";

const channelId = process.env.EBAY_CHANNEL_ID;
if (!channelId) {
  console.error(
    "Set EBAY_CHANNEL_ID in sandbox/.env or pass via EBAY_CHANNEL_ID=<id> bun run <this-file>"
  );
  process.exit(1);
}

const ORDER_REF = "18-14468-72876";
const CARRIER = "USPS";
const TRACKING = "9402266365007910852515";
const LINE_ITEMS = [{ lineItemId: "10083967811218", quantity: 1 }];

const creds = await getCredentials(channelId);
const client = createApiClient("ebay", creds);

// Step 1: Fetch existing fulfillments
console.log("=== Step 1: getFulfillments ===");
const existing = await client.getFulfillments(ORDER_REF);
console.log(`Found ${existing.length} existing fulfillment(s)`);

// Step 2: Create fulfillment via adapter
console.log("\n=== Step 2: createFulfillment ===");
console.log(
  `  Order: ${ORDER_REF} | Carrier: ${CARRIER} | Tracking: ${TRACKING}`
);

const result = await client.createFulfillment(ORDER_REF, {
  tracking: TRACKING,
  carrier: CARRIER,
  lineItems: LINE_ITEMS,
});

if (result.fulfillmentId) {
  console.log(`\n✓ SUCCESS — fulfillmentId = "${result.fulfillmentId}"`);
} else {
  console.log("\n✗ FAILED — fulfillment ID is empty");
}

// Step 3: Verify by fetching fulfillments again
console.log("\n=== Step 3: Verify (getFulfillments) ===");
const after = await client.getFulfillments(ORDER_REF);
console.log(`Found ${after.length} fulfillment(s) after create`);

// Write output
const output = {
  input: {
    orderRef: ORDER_REF,
    carrier: CARRIER,
    tracking: TRACKING,
    lineItems: LINE_ITEMS,
  },
  before: existing,
  result,
  after,
};

const outputFile = fileURLToPath(
  new URL("./output/create-fulfillment.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(output, null, 2));

console.log(`\nOutput written to ${outputFile}`);

process.exit(0);
