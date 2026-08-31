/**
 * Adapter — keyword → page of unified listing refs (eBay mobile-app search).
 *
 * Calls `searchListings` (transport + parse) and dumps listing refs +
 * pagination. For raw payloads use the sibling `direct-api/search-listings.ts`.
 *
 * Auto-mints a fresh bearer from the selected persona in
 * `sandbox/ebay/profiles/` (override with `EBAY_PROFILE`).
 *
 * Optional overrides:
 *   EBAY_SCAN_KEYWORD=toy
 *   EBAY_SCAN_PAGE=1
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/ebay/adapter/search-listings.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { searchListings } from "../../../src/adapters/ebay/api/search-listings";
import { loadAuthToken } from "../_auth";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });

const authToken = await loadAuthToken();

const keyword = process.env.EBAY_SCAN_KEYWORD ?? "toy";
const page = Number.parseInt(process.env.EBAY_SCAN_PAGE ?? "1", 10);

console.log(`Searching listings — keyword="${keyword}", page=${page}\n`);

const result = await searchListings({ keyword, page, authToken });

const outputFile = fileURLToPath(
  new URL("./output/search-listings.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(
  outputFile,
  JSON.stringify(
    {
      keyword,
      pagination: result.pagination,
      hasMore: result.hasMore,
      listings: result.listings,
    },
    null,
    2
  )
);

console.log(
  `Page ${result.pagination?.pageNumber ?? page}/${result.pagination?.totalPages ?? "?"} — ${result.listings.length} listings (totalEntries=${result.pagination?.totalEntries ?? "?"}, hasMore=${result.hasMore})\n`
);
for (const listing of result.listings.slice(0, 10)) {
  const price =
    listing.price !== null && listing.currency
      ? `${listing.currency} ${listing.price}`
      : "—";
  const seller = listing.seller?.username ?? "—";
  console.log(
    `  - [${listing.listingId}] ${listing.title.slice(0, 50)} (${price}, seller=${seller})`
  );
}
if (result.listings.length > 10) {
  console.log(`  ... and ${result.listings.length - 10} more`);
}

const uniqueSellers = new Set<string>();
for (const listing of result.listings) {
  if (listing.seller?.username) {
    uniqueSellers.add(listing.seller.username);
  }
}
console.log(`\nUnique sellers on this page: ${uniqueSellers.size}`);
console.log(`\nParsed: ${outputFile}`);

process.exit(0);
