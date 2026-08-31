/**
 * Adapter — seller username → page(s) of unified listing refs.
 *
 * Calls `getSellerListings` (transport + parse) and dumps listing refs +
 * pagination. For raw payloads use the sibling
 * `direct-api/get-seller-listings.ts`.
 *
 * Auto-mints a fresh bearer from the selected persona in
 * `sandbox/ebay/profiles/` (override with `EBAY_PROFILE`).
 *
 * Optional overrides:
 *   EBAY_SCAN_SELLER_ID=sarahabez
 *   EBAY_SCAN_PAGE=1
 *   EBAY_SCAN_WALK=1            # walk all pages instead of one
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/ebay/adapter/get-seller-listings.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  getSellerListings,
  type ListingRef,
} from "../../../src/adapters/ebay/api/get-seller-listings";
import type { EbaySearchResponse } from "../../../src/adapters/ebay/raw-types/search-response";
import { loadAuthToken } from "../_auth";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });

const authToken = await loadAuthToken();

const sellerId = process.env.EBAY_SCAN_SELLER_ID ?? "sarahabez";
const startPage = Number.parseInt(process.env.EBAY_SCAN_PAGE ?? "1", 10);
const walk = process.env.EBAY_SCAN_WALK === "1";

const outDir = fileURLToPath(new URL("./output/", import.meta.url));
await mkdir(outDir, { recursive: true });

if (walk) {
  console.log(`Walking all pages — sellerId="${sellerId}"\n`);
  const all: ListingRef[] = [];
  let page = startPage;
  let lastRaw: EbaySearchResponse | null = null;
  let totalPages: number | null = null;
  while (true) {
    const result = await getSellerListings({ sellerId, page, authToken });
    totalPages = result.pagination?.totalPages ?? null;
    console.log(
      `  page ${result.pagination?.pageNumber ?? page}/${totalPages ?? "?"}: ${result.listings.length} listings (hasMore=${result.hasMore})`
    );
    all.push(...result.listings);
    lastRaw = result.raw;
    if (!result.hasMore) {
      break;
    }
    page += 1;
  }
  await writeFile(
    `${outDir}get-seller-listings.json`,
    JSON.stringify(
      { sellerId, totalListings: all.length, totalPages, listings: all },
      null,
      2
    )
  );
  await writeFile(
    `${outDir}get-seller-listings.last-page.raw.json`,
    JSON.stringify(lastRaw, null, 2)
  );
  console.log(`\nTotal listings across all pages: ${all.length}`);
} else {
  console.log(
    `Fetching listings — sellerId="${sellerId}", page=${startPage}\n`
  );
  const result = await getSellerListings({
    sellerId,
    page: startPage,
    authToken,
  });
  await writeFile(
    `${outDir}get-seller-listings.json`,
    JSON.stringify(
      {
        sellerId,
        pagination: result.pagination,
        hasMore: result.hasMore,
        listings: result.listings,
      },
      null,
      2
    )
  );
  await writeFile(
    `${outDir}get-seller-listings.raw.json`,
    JSON.stringify(result.raw, null, 2)
  );
  console.log(
    `Page ${result.pagination?.pageNumber ?? startPage}/${result.pagination?.totalPages ?? "?"} — ${result.listings.length} listings (totalEntries=${result.pagination?.totalEntries ?? "?"}, hasMore=${result.hasMore})\n`
  );
  for (const listing of result.listings.slice(0, 10)) {
    const price =
      listing.price !== null && listing.currency
        ? `${listing.currency} ${listing.price}`
        : "—";
    console.log(
      `  - [${listing.listingId}] ${listing.title.slice(0, 60)} (${price})`
    );
  }
  if (result.listings.length > 10) {
    console.log(`  ... and ${result.listings.length - 10} more`);
  }
}

console.log(`\nOutput: ${outDir}`);
process.exit(0);
