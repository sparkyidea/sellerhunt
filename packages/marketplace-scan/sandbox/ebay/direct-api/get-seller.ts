/**
 * Direct API — seller username → raw storefront response, dumped verbatim.
 *
 * Calls `fetchSellerStorefront` (transport only — no parse), for raw shape
 * discovery. Auto-mints a bearer from the selected persona in
 * `sandbox/ebay/profiles/` (override with `EBAY_PROFILE`).
 *
 * Optional override:
 *   EBAY_SCAN_SELLER_ID=sarahabez
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/ebay/direct-api/get-seller.ts [sellerId]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { fetchSellerStorefront } from "../../../src/adapters/ebay/api/get-seller";
import { loadAuthToken } from "../_auth";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });

const sellerId =
  process.argv[2] ?? process.env.EBAY_SCAN_SELLER_ID ?? "sarahabez";

const authToken = await loadAuthToken();

console.log(`Fetching seller storefront — sellerId="${sellerId}" (raw dump)\n`);

const raw = await fetchSellerStorefront({ sellerId, authToken });

const outputFile = fileURLToPath(
  new URL(`./output/${sellerId}.json`, import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(raw, null, 2));

console.log("Top-level module keys:", Object.keys(raw.modules ?? {}));
console.log(`\nRaw response written to: ${outputFile}`);
process.exit(0);
