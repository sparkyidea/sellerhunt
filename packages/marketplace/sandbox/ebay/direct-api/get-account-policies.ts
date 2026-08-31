/**
 * Direct eBay Sell Account API — getFulfillmentPolicies, getReturnPolicies, getPaymentPolicies
 * Fetches the seller's configured shipping, return, and payment policies.
 *
 * Usage: bun run packages/marketplace/sandbox/ebay/direct-api/get-account-policies.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createEbayApiClient } from "../../../src/adapters/ebay/create-ebay-client";
import { getCredentials } from "../setup";

const channelId = process.env.EBAY_CHANNEL_ID;
if (!channelId) {
  console.error(
    "Set EBAY_CHANNEL_ID in sandbox/.env or pass via EBAY_CHANNEL_ID=<id> bun run <this-file>"
  );
  process.exit(1);
}

const creds = await getCredentials(channelId);
const client = createEbayApiClient(
  creds.clientId,
  creds.clientSecret,
  creds.accessToken,
  creds.refreshToken
);

const marketplace = "EBAY_US";

console.log(`Fetching account policies for ${marketplace}...\n`);

const [fulfillment, returns, payment] = await Promise.all([
  client.sell.account.getFulfillmentPolicies(marketplace),
  client.sell.account.getReturnPolicies(marketplace),
  client.sell.account.getPaymentPolicies(marketplace),
]);

const outputDir = fileURLToPath(new URL("./output/", import.meta.url));
await mkdir(outputDir, { recursive: true });

const ffFile = `${outputDir}get-fulfillment-policies.json`;
const rtFile = `${outputDir}get-return-policies.json`;
const pmFile = `${outputDir}get-payment-policies.json`;

await Promise.all([
  writeFile(ffFile, JSON.stringify(fulfillment, null, 2)),
  writeFile(rtFile, JSON.stringify(returns, null, 2)),
  writeFile(pmFile, JSON.stringify(payment, null, 2)),
]);

console.log("--- Fulfillment (Shipping) Policies ---");
console.log("Total:", fulfillment.total);
for (const p of fulfillment.fulfillmentPolicies ?? []) {
  console.log(`  • ${p.name} (${p.fulfillmentPolicyId})`);
}

console.log("\n--- Return Policies ---");
console.log("Total:", returns.total);
for (const p of returns.returnPolicies ?? []) {
  console.log(`  • ${p.name} (${p.returnPolicyId})`);
}

console.log("\n--- Payment Policies ---");
console.log("Total:", payment.total);
for (const p of payment.paymentPolicies ?? []) {
  console.log(`  • ${p.name} (${p.paymentPolicyId})`);
}

console.log(
  `\nRaw responses written to:\n  ${ffFile}\n  ${rtFile}\n  ${pmFile}`
);
process.exit(0);
