/**
 * Sandbox — product id → unified `ScanListing` (matches scan_listing schema).
 *
 * Mints a fresh bearer from the captured persona, then runs ProductDetailsQuery
 * + iterative AdjacentVariantsQuery against the live shop.app endpoint and
 * dumps the unified shape so it can be eyeballed against the DB schema.
 *
 * Setup: drop a persona file in `sandbox/shop/profiles/` (pick one with
 * `SHOP_PROFILE`); see that dir's README.
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/shop/get-listing.ts [listingId]
 *
 * Examples:
 *   bun run ... shop/get-listing.ts                  # uses default
 *   bun run ... shop/get-listing.ts 8404160315548    # single-axis multi-variant
 *   SHOP_MONITOR_LISTING_ID=... bun run ...          # env var also works (CLI wins)
 *
 * Suggested test products:
 *   - Single-variant ("Default Title")  — verifies variant=false, single variant row
 *   - Single-axis multi-variant         — verifies variants populated, single-call adjacency
 *   - Multi-axis (Color × Size etc)     — verifies iterative adjacency converges
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getListing } from "../../src/adapters/shop/api/get-listing";
import { getScanToken } from "../../src/index";
import { loadPersona } from "./_auth";

dotenv.config({
  path: resolve(import.meta.dirname, "../.env"),
});

const persona = loadPersona();

const listingId =
  process.argv[2] ?? process.env.SHOP_MONITOR_LISTING_ID ?? "8404160315548";

console.log("Deriving fresh bearer...");
const auth = await getScanToken({ marketplace: "shop", credentials: persona });

console.log(`Fetching product detail — listingId="${listingId}"\n`);
const result = await getListing({
  authToken: auth.accessToken,
  deviceId: persona.deviceId,
  deviceIdHw: persona.deviceIdHw,
  deviceName: persona.deviceName,
  listingId,
});

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
console.log(`  soldLast30Days:        ${l.soldLast30Days ?? "—"}`);
console.log(`  imageUrls:             ${l.imageUrls?.length ?? 0}`);
console.log(`  url:                   ${l.url ?? "—"}`);
console.log(`  variant flag:          ${l.variant}`);
console.log(`  variants count:        ${l.variants.length}`);
const adjacentPagesLen = result.raw.adjacentPages?.length ?? 0;
console.log(`  adjacency calls fired: ${adjacentPagesLen}`);

if (l.variants.length > 0) {
  console.log("\nVariants (first 5):");
  for (const v of l.variants.slice(0, 5)) {
    const attrs = v.attributes
      ? Object.entries(v.attributes)
          .map(([k, val]) => `${k}=${val}`)
          .join(", ")
      : "";
    console.log(
      `  - [${v.reference}] ${attrs || "(no options)"} → ${v.price ?? "—"}`
    );
  }
  if (l.variants.length > 5) {
    console.log(`  ... and ${l.variants.length - 5} more`);
  }
}

console.log(`\nOutput: ${outDir}`);
process.exit(0);
