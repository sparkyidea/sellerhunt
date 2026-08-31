/**
 * Direct eBay Trading API call — GetCategories
 * Pulls the full eBay US category tree.
 *
 * Usage: bun run packages/marketplace/sandbox/ebay/direct-api/get-categories.ts
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

console.log("Calling GetCategories (EBAY_US, full tree)...\n");

const response = await client.trading.GetCategories({
  CategorySiteID: 0,
  DetailLevel: "ReturnAll",
  LevelLimit: 10,
  ViewAllNodes: true,
});

// Write raw response to JSON for inspection
const outputFile = fileURLToPath(
  new URL("./output/get-categories.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(response, null, 2));

const categories = response.CategoryArray?.Category;
let categoryList: Record<string, unknown>[];
if (Array.isArray(categories)) {
  categoryList = categories;
} else if (categories) {
  categoryList = [categories];
} else {
  categoryList = [];
}

console.log(`Total categories: ${categoryList.length}`);
console.log(`Category version: ${response.CategoryVersion}`);
console.log(`Output: ${outputFile}`);

if (categoryList[0]) {
  console.log(
    `\nFirst category keys: ${Object.keys(categoryList[0]).join(", ")}`
  );
  console.log("First category:", JSON.stringify(categoryList[0], null, 2));
}

// Show a few leaf categories as examples
const leafExamples = categoryList
  .filter(
    (c: Record<string, unknown>) =>
      c.LeafCategory === "true" || c.LeafCategory === true
  )
  .slice(0, 3);
if (leafExamples.length > 0) {
  console.log("\nLeaf category examples:");
  for (const leaf of leafExamples) {
    console.log(
      `  ${leaf.CategoryID}: ${leaf.CategoryName} (parent: ${leaf.CategoryParentID})`
    );
  }
}

process.exit(0);
