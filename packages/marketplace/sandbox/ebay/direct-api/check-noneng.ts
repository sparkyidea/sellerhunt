/**
 * Check if known US category IDs exist on non-English marketplaces (DE, FR)
 * and what names they have there.
 *
 * Usage: bun run packages/marketplace/sandbox/ebay/direct-api/check-noneng.ts
 */
import { createEbayApiClient } from "../../../src/adapters/ebay/create-ebay-client";
import { getCredentials } from "../setup";

const channelId = process.env.EBAY_CHANNEL_ID;
if (!channelId) {
  console.error("Set EBAY_CHANNEL_ID");
  process.exit(1);
}

const creds = await getCredentials(channelId);
const client = createEbayApiClient(
  creds.clientId,
  creds.clientSecret,
  creds.accessToken,
  creds.refreshToken
);

// Known US category IDs to look up
const knownIds = ["9355", "175672", "1249", "139973", "15032", "11450", "177"];

const sites = [
  { id: 0, name: "EBAY_US" },
  { id: 77, name: "EBAY_DE" },
  { id: 71, name: "EBAY_FR" },
  { id: 186, name: "EBAY_ES" },
  { id: 101, name: "EBAY_IT" },
];

for (const site of sites) {
  console.log(`\n===== ${site.name} (SiteID: ${site.id}) =====`);
  try {
    const response = await client.trading.GetCategories({
      CategorySiteID: site.id,
      CategoryID: knownIds,
      DetailLevel: "ReturnAll",
      ViewAllNodes: true,
    });

    const categories = response.CategoryArray?.Category;
    let list: Record<string, unknown>[] = [];
    if (Array.isArray(categories)) {
      list = categories;
    } else if (categories) {
      list = [categories];
    }

    for (const id of knownIds) {
      const found = list.find(
        (c: Record<string, unknown>) => String(c.CategoryID) === id
      );
      if (found) {
        console.log(
          `  ID=${id}  Name="${found.CategoryName}"  Level=${found.CategoryLevel}  Parent=${found.CategoryParentID}`
        );
      } else {
        console.log(`  ID=${id}  NOT FOUND`);
      }
    }
  } catch (err) {
    console.error(`  Error: ${err}`);
  }
}

process.exit(0);
