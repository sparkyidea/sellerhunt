/**
 * Sandbox — shop.app `sellerId` → page of listing refs.
 *
 * Mints a fresh bearer from the captured persona, then runs the
 * ShopProductSearch operation against the live shop.app GraphQL endpoint.
 *
 * Setup: drop a persona file in `sandbox/shop/profiles/` (pick one with
 * `SHOP_PROFILE`); see that dir's README.
 *
 * Optional overrides:
 *   SHOP_MONITOR_SELLER_ID=26275          # Thrive Causemetics by default
 *   SHOP_MONITOR_FIRST=50
 *   SHOP_MONITOR_WALK=1                   # walk all pages instead of one
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/shop/get-seller-listings.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  getSellerListings,
  type ShopListingRef,
  type ShopProductSearchResponse,
} from "../../src/adapters/shop/api/get-seller-listings";
import { getScanToken } from "../../src/index";
import { loadPersona } from "./_auth";

dotenv.config({
  path: resolve(import.meta.dirname, "../.env"),
});

const persona = loadPersona();

const sellerId = process.env.SHOP_MONITOR_SELLER_ID ?? "26275";
const first = Number.parseInt(process.env.SHOP_MONITOR_FIRST ?? "50", 10);
const walk = process.env.SHOP_MONITOR_WALK === "1";

console.log("Deriving fresh bearer...");
const auth = await getScanToken({ marketplace: "shop", credentials: persona });

const outDir = fileURLToPath(new URL("./output/", import.meta.url));
await mkdir(outDir, { recursive: true });

if (walk) {
  console.log(
    `Walking all pages — sellerId="${sellerId}", pageSize=${first}\n`
  );
  const all: ShopListingRef[] = [];
  let cursor: string | undefined;
  let lastRaw: ShopProductSearchResponse | null = null;
  let totalCount: number | null = null;
  let pageNum = 0;
  while (true) {
    pageNum += 1;
    const result = await getSellerListings({
      authToken: auth.accessToken,
      sellerId,
      cursor,
      deviceId: persona.deviceId,
      deviceIdHw: persona.deviceIdHw,
      deviceName: persona.deviceName,
      first,
    });
    totalCount = result.totalCount ?? totalCount;
    console.log(
      `  page ${pageNum} (totalCount=${totalCount ?? "?"}): ${result.listings.length} listings (hasMore=${result.hasMore})`
    );
    all.push(...result.listings);
    lastRaw = result.raw;
    if (!(result.hasMore && result.nextCursor)) {
      break;
    }
    cursor = result.nextCursor;
  }
  await writeFile(
    `${outDir}get-seller-listings.json`,
    JSON.stringify(
      { sellerId, totalCount, fetched: all.length, listings: all },
      null,
      2
    )
  );
  await writeFile(
    `${outDir}get-seller-listings.last-page.raw.json`,
    JSON.stringify(lastRaw, null, 2)
  );
  console.log(`\nFetched ${all.length} listings across ${pageNum} pages.`);
} else {
  console.log(
    `Fetching listings — sellerId="${sellerId}", pageSize=${first}\n`
  );
  const result = await getSellerListings({
    authToken: auth.accessToken,
    sellerId,
    deviceId: persona.deviceId,
    deviceIdHw: persona.deviceIdHw,
    deviceName: persona.deviceName,
    first,
  });
  await writeFile(
    `${outDir}get-seller-listings.json`,
    JSON.stringify(
      {
        sellerId,
        totalCount: result.totalCount,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
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
    `Got ${result.listings.length} listings (totalCount=${result.totalCount ?? "?"}, hasMore=${result.hasMore})\n`
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
