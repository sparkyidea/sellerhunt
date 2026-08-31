/**
 * Compare eBay category trees across different marketplaces (sites).
 * Checks whether category IDs differ between marketplaces.
 *
 * Usage: bun run packages/marketplace/sandbox/ebay/direct-api/compare-marketplace-categories.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createEbayApiClient } from "../../../src/adapters/ebay/create-ebay-client";
import { getCredentials } from "../setup";

// eBay Site IDs — see https://developer.ebay.com/DevZone/merchandising/docs/Concepts/SiteIDToGlobalID.html
const SITES = [
  { id: 0, name: "EBAY_US" },
  { id: 2, name: "EBAY_CA" },
  { id: 3, name: "EBAY_GB" },
  { id: 15, name: "EBAY_AU" },
  { id: 77, name: "EBAY_DE" },
  { id: 71, name: "EBAY_FR" },
] as const;

// A well-known category name to search for across sites
const SEARCH_TERMS = ["Cell Phones", "Laptops", "Shoes", "Video Games"];

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

interface CategoryInfo {
  CategoryID: string;
  CategoryLevel: string;
  CategoryName: string;
  CategoryParentID: string;
  LeafCategory: string;
}

interface SiteResult {
  categoryVersion: string;
  matchedCategories: Record<string, CategoryInfo[]>;
  siteId: number;
  siteName: string;
  totalCategories: number;
}

const results: SiteResult[] = [];

for (const site of SITES) {
  console.log(`\nFetching categories for ${site.name} (SiteID: ${site.id})...`);

  try {
    const response = await client.trading.GetCategories({
      CategorySiteID: site.id,
      DetailLevel: "ReturnAll",
      LevelLimit: 10,
      ViewAllNodes: true,
    });

    const categories = response.CategoryArray?.Category;
    let categoryList: Record<string, unknown>[];
    if (Array.isArray(categories)) {
      categoryList = categories;
    } else if (categories) {
      categoryList = [categories];
    } else {
      categoryList = [];
    }

    const matched: Record<string, CategoryInfo[]> = {};
    for (const term of SEARCH_TERMS) {
      const lowerTerm = term.toLowerCase();
      matched[term] = categoryList
        .filter((c) =>
          String(c.CategoryName ?? "")
            .toLowerCase()
            .includes(lowerTerm)
        )
        .map((c) => ({
          CategoryID: String(c.CategoryID),
          CategoryName: String(c.CategoryName),
          CategoryParentID: String(c.CategoryParentID),
          CategoryLevel: String(c.CategoryLevel),
          LeafCategory: String(c.LeafCategory),
        }));
    }

    const result: SiteResult = {
      siteId: site.id,
      siteName: site.name,
      categoryVersion: String(response.CategoryVersion),
      totalCategories: categoryList.length,
      matchedCategories: matched,
    };

    results.push(result);

    console.log(
      `  Version: ${result.categoryVersion}, Total: ${result.totalCategories}`
    );
    for (const term of SEARCH_TERMS) {
      const matches = matched[term];
      if (matches && matches.length > 0) {
        console.log(`  "${term}" matches:`);
        for (const m of matches.slice(0, 3)) {
          console.log(`    ID=${m.CategoryID} Name="${m.CategoryName}"`);
        }
        if (matches.length > 3) {
          console.log(`    ... and ${matches.length - 3} more`);
        }
      } else {
        console.log(`  "${term}": no match (may use different language)`);
      }
    }
  } catch (err) {
    console.error(`  Error fetching ${site.name}:`, err);
  }
}

// Summary comparison
console.log("\n\n========== COMPARISON SUMMARY ==========\n");
console.log("Site".padEnd(12), "Version".padEnd(10), "Total Categories");
console.log("-".repeat(45));
for (const r of results) {
  console.log(
    r.siteName.padEnd(12),
    r.categoryVersion.padEnd(10),
    String(r.totalCategories)
  );
}

console.log("\n--- Category ID comparison for matched terms ---\n");
for (const term of SEARCH_TERMS) {
  console.log(`"${term}":`);
  for (const r of results) {
    const matches = r.matchedCategories[term];
    if (matches && matches.length > 0) {
      const ids = matches.map((m) => m.CategoryID).join(", ");
      console.log(`  ${r.siteName.padEnd(12)} IDs: ${ids}`);
    } else {
      console.log(`  ${r.siteName.padEnd(12)} (no match)`);
    }
  }
  console.log();
}

// Write full results to JSON
const outputFile = fileURLToPath(
  new URL("./output/compare-marketplace-categories.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(results, null, 2));
console.log(`Full results written to: ${outputFile}`);

process.exit(0);
