/**
 * Adapter — seller username → unified seller record.
 *
 * Calls `getSeller` (transport + parse) and dumps the parsed shape. For raw
 * payloads use the sibling `direct-api/get-seller.ts`.
 *
 * Auto-mints a fresh bearer from the selected persona in
 * `sandbox/ebay/profiles/` (override with `EBAY_PROFILE`).
 *
 * Optional override:
 *   EBAY_SCAN_SELLER_ID=sarahabez
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/ebay/adapter/get-seller.ts [sellerId]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getSeller } from "../../../src/adapters/ebay/api/get-seller";
import { loadAuthToken } from "../_auth";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });

const authToken = await loadAuthToken();

const sellerId =
  process.argv[2] ?? process.env.EBAY_SCAN_SELLER_ID ?? "sarahabez";

console.log(`Fetching seller — sellerId="${sellerId}"\n`);

const result = await getSeller({ sellerId, authToken });

const outputFile = fileURLToPath(
  new URL("./output/get-seller.json", import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(
  outputFile,
  JSON.stringify({ sellerId: result.sellerId, seller: result.seller }, null, 2)
);

console.log("Parsed seller:");
console.log(JSON.stringify(result.seller, null, 2));
console.log(`\nParsed: ${outputFile}`);

process.exit(0);
