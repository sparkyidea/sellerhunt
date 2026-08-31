/**
 * Direct eBay Sell Finances API — getTransactions + getPayouts
 * Fetches financial transactions (sales, fees, refunds) and payout summaries.
 *
 * Usage: bun run packages/marketplace/sandbox/ebay/direct-api/get-transactions.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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

console.log("Calling sell.finances.getTransactions...\n");

const transactions = await client.sell.finances.getTransactions({
  limit: 10,
  sort: "-transactionDate",
});

const txFile = fileURLToPath(
  new URL("./output/get-transactions.json", import.meta.url)
);
await mkdir(dirname(txFile), { recursive: true });
await writeFile(txFile, JSON.stringify(transactions, null, 2));

console.log("--- Transactions ---");
console.log("Top-level keys:", Object.keys(transactions));
console.log("Total:", transactions.total);

if (transactions.transactions?.[0]) {
  console.log(
    "\nFirst transaction keys:",
    Object.keys(transactions.transactions[0])
  );
  console.log(
    "Type:",
    transactions.transactions[0].transactionType,
    "| Status:",
    transactions.transactions[0].transactionStatus
  );
  console.log("Amount:", JSON.stringify(transactions.transactions[0].amount));
}

console.log("\n\nCalling sell.finances.getPayouts...\n");

const payouts = await client.sell.finances.getPayouts({
  limit: 5,
  sort: "-payoutDate",
});

const payFile = fileURLToPath(
  new URL("./output/get-payouts.json", import.meta.url)
);
await writeFile(payFile, JSON.stringify(payouts, null, 2));

console.log("--- Payouts ---");
console.log("Top-level keys:", Object.keys(payouts));
console.log("Total:", payouts.total);

if (payouts.payouts?.[0]) {
  console.log("\nFirst payout keys:", Object.keys(payouts.payouts[0]));
  console.log(
    "Status:",
    payouts.payouts[0].payoutStatus,
    "| Amount:",
    JSON.stringify(payouts.payouts[0].amount)
  );
}

console.log(`\nRaw responses written to:\n  ${txFile}\n  ${payFile}`);
process.exit(0);
