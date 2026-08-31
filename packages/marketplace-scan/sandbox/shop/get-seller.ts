/**
 * Sandbox — shop.app `sellerId` → store metadata.
 *
 * Mints a fresh bearer from the captured persona, then runs the StoreMeta
 * GraphQL operation against the live shop.app endpoint.
 *
 * Setup: drop a persona file in `sandbox/shop/profiles/` (pick one with
 * `SHOP_PROFILE`); see that dir's README.
 *
 * Optional overrides:
 *   SHOP_MONITOR_SELLER_ID=165053         # default = the captured Knix store
 *
 * Run:
 *   bun run packages/marketplace-scan/sandbox/shop/get-seller.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getSeller } from "../../src/adapters/shop/api/get-seller";
import { getScanToken } from "../../src/index";
import { loadPersona } from "./_auth";

dotenv.config({
  path: resolve(import.meta.dirname, "../.env"),
});

const persona = loadPersona();

const sellerId = process.env.SHOP_MONITOR_SELLER_ID ?? "165053";

console.log("Deriving fresh bearer...");
const auth = await getScanToken({ marketplace: "shop", credentials: persona });

console.log(`Fetching store metadata — sellerId="${sellerId}"\n`);
const result = await getSeller({
  authToken: auth.accessToken,
  sellerId,
  deviceId: persona.deviceId,
  deviceIdHw: persona.deviceIdHw,
  deviceName: persona.deviceName,
});

const outDir = fileURLToPath(new URL("./output/", import.meta.url));
await mkdir(outDir, { recursive: true });
await writeFile(
  `${outDir}get-seller.json`,
  JSON.stringify(result.seller, null, 2)
);
await writeFile(
  `${outDir}get-seller.raw.json`,
  JSON.stringify(result.raw, null, 2)
);

const s = result.seller;
console.log(`  name:                ${s.name ?? "—"}`);
console.log(`  shopifyId:           ${s.shopifyId ?? "—"}`);
console.log(`  myshopifyDomain:     ${s.myshopifyDomain ?? "—"}`);
console.log(`  websiteUrl:          ${s.websiteUrl ?? "—"}`);
console.log(`  shareUrl:            ${s.shareUrl ?? "—"}`);
console.log(`  shopNetwork:         ${s.shopNetwork ?? "—"}`);
console.log(`  storeEligible:       ${s.storeEligible ?? "—"}`);
console.log(`  followedByMe:        ${s.followedByMe ?? "—"}`);
console.log(
  `  shipping:            from=${s.shippingFromCountry ?? "—"} shipsToCountry=${s.shipsToCountry ?? "—"}`
);
console.log(
  `  reviews:             avg=${s.averageRating ?? "—"} reviews=${s.totalProductReviews ?? "—"} ratings=${s.totalProductRatings ?? "—"}`
);
console.log(`  logoUrl:             ${s.logoUrl ?? "—"}`);
console.log(`  coverImageUrl:       ${s.coverImageUrl ?? "—"}`);
console.log(`  featuredImages:      ${s.featuredImageUrls.length}`);
console.log(`  discountIds:         ${s.discountIds.length}`);
console.log(`  featuredInHandles:   ${s.featuredInHandles.join(",") || "—"}`);

console.log(`\nOutput: ${outDir}`);
process.exit(0);
