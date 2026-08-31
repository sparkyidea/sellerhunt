/**
 * Direct eBay Sell Marketing API — getCampaigns + getPromotions
 * Fetches active ad campaigns and item promotions.
 *
 * Usage: bun run packages/marketplace/sandbox/ebay/direct-api/get-promotions.ts
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

console.log("Calling sell.marketing.getCampaigns...\n");

const campaigns = await client.sell.marketing.getCampaigns({
  limit: 10,
});

const campFile = fileURLToPath(
  new URL("./output/get-campaigns.json", import.meta.url)
);
await mkdir(dirname(campFile), { recursive: true });
await writeFile(campFile, JSON.stringify(campaigns, null, 2));

console.log("--- Campaigns ---");
console.log("Top-level keys:", Object.keys(campaigns));
console.log("Total:", campaigns.total);

if (campaigns.campaigns?.[0]) {
  console.log("\nFirst campaign keys:", Object.keys(campaigns.campaigns[0]));
  console.log(
    "Name:",
    campaigns.campaigns[0].campaignName,
    "| Status:",
    campaigns.campaigns[0].campaignStatus
  );
}

console.log("\n\nCalling sell.marketing.getPromotions...\n");

const promotions = await client.sell.marketing.getPromotions("EBAY_US", {
  limit: 10,
});

const promoFile = fileURLToPath(
  new URL("./output/get-promotions.json", import.meta.url)
);
await writeFile(promoFile, JSON.stringify(promotions, null, 2));

console.log("--- Promotions ---");
console.log("Top-level keys:", Object.keys(promotions));
console.log("Total:", promotions.total);

if (promotions.promotions?.[0]) {
  console.log("\nFirst promotion keys:", Object.keys(promotions.promotions[0]));
  console.log(
    "Name:",
    promotions.promotions[0].name,
    "| Type:",
    promotions.promotions[0].promotionType,
    "| Status:",
    promotions.promotions[0].promotionStatus
  );
}

console.log(`\nRaw responses written to:\n  ${campFile}\n  ${promoFile}`);
process.exit(0);
