/**
 * Sandbox — shop.app keyword → page of listing refs + shop refs.
 *
 * Mints a fresh bearer from the captured persona, then runs the
 * SearchProductsModular operation against the live shop.app endpoint.
 *
 * Setup: drop a persona file in `sandbox/shop/profiles/` (pick one with
 * `SHOP_PROFILE`); see that dir's README.
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/shop/search-listings.ts [keyword]
 *
 * Examples:
 *   bun run ... shop/search-listings.ts                          # uses default
 *   bun run ... shop/search-listings.ts "nintendo switch 2"      # custom keyword
 *   SHOP_MONITOR_KEYWORD=... bun run ...                         # env var also works (CLI wins)
 *   SHOP_MONITOR_WALK=1 bun run ...                              # walk all pages
 *
 * Other optional env: SHOP_MONITOR_FIRST=30 (page size).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  type ShopSearchListingRef,
  type ShopSearchListingShop,
  type ShopSearchProductsModularResponse,
  searchListings,
} from "../../src/adapters/shop/api/search-listings";
import { getScanToken } from "../../src/index";
import { loadPersona } from "./_auth";

dotenv.config({
  path: resolve(import.meta.dirname, "../.env"),
});

const persona = loadPersona();

const keyword =
  process.argv[2] ?? process.env.SHOP_MONITOR_KEYWORD ?? "nintendo switch 2";
const first = Number.parseInt(process.env.SHOP_MONITOR_FIRST ?? "30", 10);
const walk = process.env.SHOP_MONITOR_WALK === "1";

console.log("Deriving fresh bearer...");
const auth = await getScanToken({ marketplace: "shop", credentials: persona });

const outDir = fileURLToPath(new URL("./output/", import.meta.url));
await mkdir(outDir, { recursive: true });

if (walk) {
  console.log(`Walking all pages — keyword="${keyword}", pageSize=${first}\n`);
  const allListings: ShopSearchListingRef[] = [];
  const allShops = new Map<string, ShopSearchListingShop>();
  let cursor: string | undefined;
  let sessionId: string | undefined;
  let lastRaw: ShopSearchProductsModularResponse | null = null;
  let totalCount: number | null = null;
  let pageNum = 0;
  while (true) {
    pageNum += 1;
    const result = await searchListings({
      authToken: auth.accessToken,
      cursor,
      deviceId: persona.deviceId,
      deviceIdHw: persona.deviceIdHw,
      deviceName: persona.deviceName,
      first,
      keyword,
      sessionId,
    });
    sessionId = result.sessionId;
    totalCount = result.totalCount ?? totalCount;
    console.log(
      `  page ${pageNum} (totalCount=${totalCount ?? "?"}): listings=${result.listings.length} shops=${result.shops.length} hasMore=${result.hasMore}`
    );
    allListings.push(...result.listings);
    for (const shop of result.shops) {
      if (shop.id && !allShops.has(shop.id)) {
        allShops.set(shop.id, shop);
      }
    }
    lastRaw = result.raw;
    if (!(result.hasMore && result.nextCursor)) {
      break;
    }
    cursor = result.nextCursor;
  }
  await writeFile(
    `${outDir}search-listings.json`,
    JSON.stringify(
      {
        keyword,
        totalCount,
        sessionId,
        listings: allListings,
        shops: [...allShops.values()],
      },
      null,
      2
    )
  );
  await writeFile(
    `${outDir}search-listings.last-page.raw.json`,
    JSON.stringify(lastRaw, null, 2)
  );
  console.log(
    `\nFetched ${allListings.length} listings + ${allShops.size} shops across ${pageNum} pages.`
  );
} else {
  console.log(`Searching — keyword="${keyword}", pageSize=${first}\n`);
  const result = await searchListings({
    authToken: auth.accessToken,
    deviceId: persona.deviceId,
    deviceIdHw: persona.deviceIdHw,
    deviceName: persona.deviceName,
    first,
    keyword,
  });
  await writeFile(
    `${outDir}search-listings.json`,
    JSON.stringify(
      {
        keyword,
        totalCount: result.totalCount,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
        sessionId: result.sessionId,
        listings: result.listings,
        shops: result.shops,
      },
      null,
      2
    )
  );
  await writeFile(
    `${outDir}search-listings.raw.json`,
    JSON.stringify(result.raw, null, 2)
  );
  console.log(
    `Got ${result.listings.length} listings + ${result.shops.length} shops (totalCount=${result.totalCount ?? "?"}, hasMore=${result.hasMore})\n`
  );
  for (const listing of result.listings.slice(0, 10)) {
    const price =
      listing.price !== null && listing.currency
        ? `${listing.currency} ${listing.price}`
        : "—";
    const shop = listing.shop?.name ?? listing.shop?.sellerId ?? "—";
    console.log(
      `  - [${listing.listingId}] ${listing.title.slice(0, 50)} (${price}) @ ${shop}`
    );
  }
  if (result.listings.length > 10) {
    console.log(`  ... and ${result.listings.length - 10} more`);
  }
  if (result.shops.length > 0) {
    console.log("\nShops surfaced (deduped):");
    for (const shop of result.shops.slice(0, 10)) {
      console.log(
        `  - [${shop.sellerId ?? "?"}] ${shop.name ?? "—"} (${shop.id ?? "—"})`
      );
    }
    if (result.shops.length > 10) {
      console.log(`  ... and ${result.shops.length - 10} more`);
    }
  }
}

console.log(`\nOutput: ${outDir}`);
process.exit(0);
