/**
 * Direct eBay Sell Analytics API — getTrafficReport
 * Fetches listing-level traffic data: impressions, page views, clicks.
 *
 * Usage: bun run packages/marketplace/sandbox/ebay/direct-api/get-traffic-report.ts
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

// Last 30 days
const endDate = new Date();
const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const fmt = (d: Date) => d.toISOString().split("T")[0];

console.log(
  `Calling sell.analytics.getTrafficReport (${fmt(startDate)} → ${fmt(endDate)})...\n`
);

const response = await client.sell.analytics.getTrafficReport({
  dimension: "LISTING",
  filter: `date_range:[${fmt(startDate)}..${fmt(endDate)}],marketplace_id:{EBAY_US}`,
  metric:
    "CLICK_THROUGH_RATE,LISTING_IMPRESSION_TOTAL,LISTING_VIEWS_TOTAL,SALES_CONVERSION_RATE,TRANSACTION",
  sort: "-LISTING_VIEWS_TOTAL",
});

const outputFile = fileURLToPath(
  new URL("./output/get-traffic-report.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(response, null, 2));

console.log("Top-level keys:", Object.keys(response));

const records = response.dimensionMetrics;
if (Array.isArray(records)) {
  console.log(`\nListings with traffic data: ${records.length}`);
  if (records[0]) {
    console.log("First record keys:", Object.keys(records[0]));
    console.log("First record:", JSON.stringify(records[0], null, 2));
  }
} else {
  console.log("\nNo traffic data returned.");
}

console.log(`\nRaw response written to: ${outputFile}`);
process.exit(0);
