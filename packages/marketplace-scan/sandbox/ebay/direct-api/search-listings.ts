/**
 * Direct API — keyword → raw search response (one page), dumped verbatim.
 *
 * Calls `fetchSearchListings` (transport only — no parse), for raw shape
 * discovery. Auto-mints a bearer from the selected persona in
 * `sandbox/ebay/profiles/` (override with `EBAY_PROFILE`).
 *
 * Optional overrides:
 *   EBAY_SCAN_KEYWORD=toy
 *   EBAY_SCAN_PAGE=1
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/ebay/direct-api/search-listings.ts [keyword] [page]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { fetchSearchListings } from "../../../src/adapters/ebay/api/search-listings";
import { loadAuthToken } from "../_auth";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });

const keyword = process.argv[2] ?? process.env.EBAY_SCAN_KEYWORD ?? "toy";
const page = Number.parseInt(
  process.argv[3] ?? process.env.EBAY_SCAN_PAGE ?? "1",
  10
);

const authToken = await loadAuthToken();

console.log(`Searching — keyword="${keyword}", page=${page} (raw dump)\n`);

const raw = await fetchSearchListings({ keyword, page, authToken });

const safeKeyword = keyword.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const outputFile = fileURLToPath(
  new URL(`./output/${safeKeyword}.page-${page}.json`, import.meta.url)
);
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(raw, null, 2));

console.log(`Raw response written to: ${outputFile}`);
process.exit(0);
