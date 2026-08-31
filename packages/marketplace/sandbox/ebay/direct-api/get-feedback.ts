/**
 * Direct eBay Trading API call — GetFeedback
 * Fetches buyer feedback / reviews for listings.
 *
 * Usage:
 *   bun run packages/marketplace/sandbox/ebay/direct-api/get-feedback.ts
 *   EBAY_ITEM_ID=123456 bun run packages/marketplace/sandbox/ebay/direct-api/get-feedback.ts
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

const itemId = process.env.EBAY_ITEM_ID;

console.log(
  itemId
    ? `Calling GetFeedback for item ${itemId}...\n`
    : "Calling GetFeedback (all recent feedback)...\n"
);

const response = await client.trading.GetFeedback({
  Pagination: {
    EntriesPerPage: 25,
    PageNumber: 1,
  },
  ...(itemId && { ItemID: itemId }),
});

// Write raw response
const suffix = itemId ? `-${itemId}` : "";
const outputFile = fileURLToPath(
  new URL(`./output/get-feedback${suffix}.json`, import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(response, null, 2));

console.log("Top-level keys:", Object.keys(response));

const summary = response.FeedbackSummary;
if (summary) {
  console.log("\n--- Feedback Summary ---");
  console.log("Unique positive (12m):", summary.UniquePositiveFeedbackCount);
  console.log("Unique negative (12m):", summary.UniqueNegativeFeedbackCount);
  console.log("Unique neutral (12m):", summary.UniqueNeutralFeedbackCount);
}

const details = response.FeedbackDetailArray?.FeedbackDetail;
if (details) {
  const list = Array.isArray(details) ? details : [details];
  console.log(`\nFeedback entries returned: ${list.length}`);
  if (list[0]) {
    console.log("\nFirst entry keys:", Object.keys(list[0]));
    console.log("First entry:", JSON.stringify(list[0], null, 2));
  }
}

console.log(`\nRaw response written to: ${outputFile}`);
process.exit(0);
