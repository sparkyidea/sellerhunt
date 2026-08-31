/**
 * Direct API — listing id(s) → raw view-item response, dumped verbatim.
 *
 * Calls `fetchListingDetail` (the transport layer only — no parse/map), so it
 * captures the raw payload even when the mapper would choke on a shape change.
 * Accepts many ids at once, which makes bulk raw capture for analysis trivial.
 *
 * Auto-mints one bearer from the selected persona in `sandbox/ebay/profiles/`
 * (override with `EBAY_PROFILE`).
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/ebay/direct-api/get-listing.ts [id...]
 *
 * Examples:
 *   bun run .../direct-api/get-listing.ts                       # uses EBAY_SCAN_LISTING_ID / default
 *   bun run .../direct-api/get-listing.ts 147197245907          # single id
 *   bun run .../direct-api/get-listing.ts 147197245907 385181111174 388101067625
 *
 * Each raw response is written to ./output/<id>.json.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { fetchListingDetail } from "../../../src/adapters/ebay/api/get-listing";
import { extractItemSold } from "../../../src/adapters/ebay/api/helper/extract-sold-count";
import { loadAuthToken } from "../_auth";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });

const cliIds = process.argv.slice(2);
const listingIds =
  cliIds.length > 0
    ? cliIds
    : [process.env.EBAY_SCAN_LISTING_ID ?? "136784592725"];

const authToken = await loadAuthToken();

const outDir = fileURLToPath(new URL("./output/", import.meta.url));
await mkdir(outDir, { recursive: true });

console.log(`Fetching ${listingIds.length} listing(s) — raw dump\n`);

for (const listingId of listingIds) {
  try {
    const raw = await fetchListingDetail({ listingId, authToken });
    const json = JSON.stringify(raw, null, 2);
    await writeFile(`${outDir}${listingId}.json`, json);

    const vls = raw.modules?.VLS?.listing;
    const itemSold = extractItemSold(vls);
    console.log(
      `  ok  [${listingId}] itemSold=${itemSold ?? "—"}  (${json.length} bytes)`
    );
  } catch (err) {
    console.log(
      `  ERR [${listingId}] ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

console.log(`\nOutput: ${outDir}`);
process.exit(0);
