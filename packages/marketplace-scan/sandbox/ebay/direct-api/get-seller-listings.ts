/**
 * Direct API — seller username → raw search response (one page), dumped verbatim.
 *
 * Calls `fetchSellerListings` (transport only — no parse), for raw shape
 * discovery. Auto-mints a bearer from the selected persona in
 * `sandbox/ebay/profiles/` (override with `EBAY_PROFILE`).
 *
 * Optional overrides:
 *   EBAY_SCAN_SELLER_ID=sarahabez
 *   EBAY_SCAN_PAGE=1
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/ebay/direct-api/get-seller-listings.ts [sellerId] [page]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { fetchSellerListings } from "../../../src/adapters/ebay/api/get-seller-listings";
import { loadAuthToken } from "../_auth";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });

const sellerId =
  process.argv[2] ?? process.env.EBAY_SCAN_SELLER_ID ?? "sarahabez";
const page = Number.parseInt(
  process.argv[3] ?? process.env.EBAY_SCAN_PAGE ?? "1",
  10
);

const authToken = await loadAuthToken();

console.log(
  `Fetching seller listings — sellerId="${sellerId}", page=${page} (raw dump)\n`
);

const raw = await fetchSellerListings({ sellerId, page, authToken });

const outputFile = fileURLToPath(
  new URL(`./output/${sellerId}.page-${page}.json`, import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(raw, null, 2));

console.log(`Raw response written to: ${outputFile}`);
process.exit(0);
