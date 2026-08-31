/**
 * Adapter — listing id → unified `ScanListing` (matches scan_listing schema).
 *
 * Calls `getListing` (transport + parse + map) and dumps the unified shape so it
 * can be eyeballed against the DB schema. For raw payloads use the sibling
 * `direct-api/get-listing.ts`.
 *
 * Auto-mints a fresh bearer from the selected persona in
 * `sandbox/ebay/profiles/` (override with `EBAY_PROFILE`).
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/ebay/adapter/get-listing.ts [listingId]
 *
 * Examples:
 *   bun run .../adapter/get-listing.ts                 # uses default
 *   bun run .../adapter/get-listing.ts 137173114663    # 13-variant Mario set (multi-variation)
 *   bun run .../adapter/get-listing.ts 136784592725    # single-item listing
 *   EBAY_SCAN_LISTING_ID=... bun run ...               # env var also works (CLI wins)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getListing } from "../../../src/adapters/ebay/api/get-listing";
import { loadAuthToken } from "../_auth";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });

const authToken = await loadAuthToken();

const listingId =
  process.argv[2] ?? process.env.EBAY_SCAN_LISTING_ID ?? "136784592725";

console.log(`Fetching listing detail — listingId="${listingId}"\n`);

const result = await getListing({ listingId, authToken });

const outDir = fileURLToPath(new URL("./output/", import.meta.url));
await mkdir(outDir, { recursive: true });

await writeFile(
  `${outDir}get-listing.json`,
  JSON.stringify(
    { listingId: result.listingId, listing: result.listing },
    null,
    2
  )
);
await writeFile(
  `${outDir}get-listing.raw.json`,
  JSON.stringify(result.raw, null, 2)
);

const l = result.listing;
console.log("ScanListing form (→ scan_listing row):");
console.log(`  marketplace:           ${l.marketplace}`);
console.log(`  reference:             ${l.reference}`);
console.log(`  title:                 ${l.title.slice(0, 70)}`);
console.log(`  sellerReference:       ${l.sellerReference ?? "—"}`);
console.log(`  price/currency:        ${l.price ?? "—"} ${l.currency ?? ""}`);
console.log(
  `  itemSold/soldLast24h:  ${l.itemSold ?? "—"} / ${l.soldLast24h ?? "—"}`
);
console.log(`  imageUrls:             ${l.imageUrls?.length ?? 0}`);
console.log(`  url:                   ${l.url ?? "—"}`);
console.log(`  variant flag:          ${l.variant}`);
console.log(`  variants count:        ${l.variants.length}`);

if (l.variants.length > 0) {
  console.log("\nVariants (first 5):");
  for (const v of l.variants.slice(0, 5)) {
    const attrs = v.attributes
      ? Object.entries(v.attributes)
          .map(([k, val]) => `${k}=${val}`)
          .join(", ")
      : "";
    console.log(
      `  - [${v.reference}] ${attrs || "(synthetic)"} → ${v.price ?? "—"}`
    );
  }
  if (l.variants.length > 5) {
    console.log(`  ... and ${l.variants.length - 5} more`);
  }
}

console.log(`\nOutput: ${outDir}`);
process.exit(0);
