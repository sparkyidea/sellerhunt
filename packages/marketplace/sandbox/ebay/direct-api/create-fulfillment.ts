/**
 * Direct eBay Sell Fulfillment API call — createFulfillment
 * Tests the raw response shape to debug fulfillment ID extraction.
 *
 * Usage: EBAY_CHANNEL_ID=<id> bun run packages/marketplace/sandbox/ebay/direct-api/create-fulfillment.ts
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

const ORDER_REF = "18-14468-72876";
const CARRIER = "USPS";
const TRACKING = "9402266365007910852515";
const LINE_ITEMS = [{ lineItemId: "10083967811218", quantity: 1 }];

const creds = await getCredentials(channelId);
const client = createEbayApiClient(
  creds.clientId,
  creds.clientSecret,
  creds.accessToken,
  creds.refreshToken
);

const body = {
  lineItems: LINE_ITEMS,
  shippingCarrierCode: CARRIER,
  trackingNumber: TRACKING,
};

const outputDir = fileURLToPath(new URL("./output/", import.meta.url));
await mkdir(outputDir, { recursive: true });

// 1. Check existing fulfillments
console.log("=== Existing fulfillments ===");
const existing =
  await client.sell.fulfillment.getShippingFulfillments(ORDER_REF);

await writeFile(
  `${outputDir}create-fulfillment-before.json`,
  JSON.stringify(existing, null, 2)
);
console.log(`Fulfillments: ${existing.fulfillments?.length ?? 0}`);

// 2. Test default response (response.data)
console.log("\n=== createFulfillment (default mode) ===");
let defaultResult: unknown = null;
try {
  defaultResult = await client.sell.fulfillment.createShippingFulfillment(
    ORDER_REF,
    body
  );
  console.log("type:", typeof defaultResult);
} catch (err: unknown) {
  const e = err as Record<string, unknown>;
  defaultResult = { error: e.message, meta: e.meta };
  console.error("Error (default):", e.message);
}

// 3. Test with returnResponse = true to get full axios response
console.log("\n=== createFulfillment (returnResponse mode) ===");
(
  client.sell.fulfillment as unknown as { apiConfig: Record<string, unknown> }
).apiConfig.returnResponse = true;

let rawResult: unknown = null;
try {
  const rawResponse = await client.sell.fulfillment.createShippingFulfillment(
    ORDER_REF,
    body
  );
  rawResult = {
    status: rawResponse.status,
    statusText: rawResponse.statusText,
    headers: rawResponse.headers,
    data: rawResponse.data,
  };
  console.log("status:", rawResponse.status);

  const location = rawResponse.headers?.location;
  if (location) {
    const parts = location.split("/");
    console.log("Extracted fulfillmentId:", parts.at(-1));
  } else {
    console.log("No Location header found");
  }
} catch (err: unknown) {
  const e = err as Record<string, unknown>;
  rawResult = { error: e.message, meta: e.meta };
  console.error("Error (raw):", e.message);
}

// Write output
const output = {
  input: {
    orderRef: ORDER_REF,
    carrier: CARRIER,
    tracking: TRACKING,
    lineItems: LINE_ITEMS,
  },
  before: existing,
  defaultMode: defaultResult,
  returnResponseMode: rawResult,
};

const outputFile = `${outputDir}create-fulfillment.json`;
await writeFile(outputFile, JSON.stringify(output, null, 2));

console.log(`\nRaw responses written to: ${outputFile}`);
process.exit(0);
