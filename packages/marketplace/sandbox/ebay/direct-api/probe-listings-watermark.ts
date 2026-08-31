/**
 * Probe eBay's incremental listing-sync surface area.
 *
 * Walks several time-filter combinations across two Trading API calls
 * (GetSellerList, GetSellerEvents) and prints how many items each one
 * returns. We expect to see a large delta when the watermark is honored
 * (e.g. an old window vs a fresh window producing different counts).
 *
 * Usage: bun run packages/marketplace/sandbox/ebay/direct-api/probe-listings-watermark.ts
 */
import { createEbayApiClient } from "../../../src/adapters/ebay/create-ebay-client";
import { getCredentials } from "../setup";

const channelId = process.env.EBAY_CHANNEL_ID;
if (!channelId) {
  console.error("Set EBAY_CHANNEL_ID in sandbox/.env");
  process.exit(1);
}

const creds = await getCredentials(channelId);
const client = createEbayApiClient(
  creds.clientId,
  creds.clientSecret,
  creds.accessToken,
  creds.refreshToken
);

const NOW = new Date();
const NOW_ISO = NOW.toISOString();
const ONE_DAY_AGO = new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString();
const FORTY_HOURS_AGO = new Date(
  NOW.getTime() - 40 * 60 * 60 * 1000
).toISOString();
const NINETY_DAYS_FORWARD = new Date(
  NOW.getTime() + 90 * 24 * 60 * 60 * 1000
).toISOString();
const FUTURE = "2099-01-01T00:00:00.000Z";

function countItems(response: unknown): number {
  const r = response as {
    ItemArray?: { Item?: unknown };
    PaginationResult?: { TotalNumberOfEntries?: number | string };
  };
  const total = r.PaginationResult?.TotalNumberOfEntries;
  if (total !== undefined) {
    return typeof total === "string" ? Number.parseInt(total, 10) : total;
  }
  const item = r.ItemArray?.Item;
  if (!item) {
    return 0;
  }
  return Array.isArray(item) ? item.length : 1;
}

async function probe(label: string, fn: () => Promise<unknown>): Promise<void> {
  process.stdout.write(`${label.padEnd(70)} `);
  try {
    const response = await fn();
    const count = countItems(response);
    console.log(`-> ${count} items`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`-> ERROR: ${msg.slice(0, 100)}`);
  }
}

console.log(
  `\nNOW: ${NOW_ISO}\nONE_DAY_AGO: ${ONE_DAY_AGO}\nFORTY_HOURS_AGO: ${FORTY_HOURS_AGO}\n`
);

console.log("--- GetSellerList: vary GranularityLevel with ModTime ---");
await probe("EndTime only (baseline)", () =>
  client.trading.GetSellerList({
    Pagination: { EntriesPerPage: 200, PageNumber: 1 },
    GranularityLevel: "Coarse",
    EndTimeFrom: NOW_ISO,
    EndTimeTo: NINETY_DAYS_FORWARD,
  })
);
await probe("EndTime + ModTimeFrom=1d ago, no GranularityLevel", () =>
  client.trading.GetSellerList({
    Pagination: { EntriesPerPage: 200, PageNumber: 1 },
    EndTimeFrom: NOW_ISO,
    EndTimeTo: NINETY_DAYS_FORWARD,
    ModTimeFrom: ONE_DAY_AGO,
    ModTimeTo: NOW_ISO,
  })
);
await probe("EndTime + ModTimeFrom=1d ago, GranularityLevel=Fine", () =>
  client.trading.GetSellerList({
    Pagination: { EntriesPerPage: 200, PageNumber: 1 },
    GranularityLevel: "Fine",
    EndTimeFrom: NOW_ISO,
    EndTimeTo: NINETY_DAYS_FORWARD,
    ModTimeFrom: ONE_DAY_AGO,
    ModTimeTo: NOW_ISO,
  })
);
await probe("EndTime + ModTimeFrom=FUTURE (should be 0)", () =>
  client.trading.GetSellerList({
    Pagination: { EntriesPerPage: 200, PageNumber: 1 },
    EndTimeFrom: NOW_ISO,
    EndTimeTo: NINETY_DAYS_FORWARD,
    ModTimeFrom: FUTURE,
    ModTimeTo: FUTURE,
  })
);

console.log("\n--- GetSellerEvents: ModTime within 48h ---");
await probe("ModTimeFrom=40h ago, ModTimeTo=now", () =>
  client.trading.GetSellerEvents({
    ModTimeFrom: FORTY_HOURS_AGO,
    ModTimeTo: NOW_ISO,
  })
);
await probe("ModTimeFrom=1h ago, ModTimeTo=now", () =>
  client.trading.GetSellerEvents({
    ModTimeFrom: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
    ModTimeTo: NOW_ISO,
  })
);
await probe(
  "ModTimeFrom=now+1m, ModTimeTo=now+2m (future, should 0/error)",
  () =>
    client.trading.GetSellerEvents({
      ModTimeFrom: new Date(NOW.getTime() + 60 * 1000).toISOString(),
      ModTimeTo: new Date(NOW.getTime() + 2 * 60 * 1000).toISOString(),
    })
);
await probe("NewItemFilter=true (items listed in last 48h)", () =>
  client.trading.GetSellerEvents({ NewItemFilter: true })
);

console.log("\n--- Inspect GetSellerEvents response shape ---");
const sample = (await client.trading.GetSellerEvents({
  ModTimeFrom: FORTY_HOURS_AGO,
  ModTimeTo: NOW_ISO,
})) as Record<string, unknown>;
console.log("Top-level keys:", Object.keys(sample));
const itemArray = sample.ItemArray as { Item?: unknown } | undefined;
let items: unknown[] = [];
if (Array.isArray(itemArray?.Item)) {
  items = itemArray.Item;
} else if (itemArray?.Item) {
  items = [itemArray.Item];
}
if (items.length > 0) {
  const first = items[0] as Record<string, unknown>;
  console.log("First item keys:", Object.keys(first).slice(0, 20));
  console.log("Sample item: ItemID =", first.ItemID, "Title =", first.Title);
}

process.exit(0);
