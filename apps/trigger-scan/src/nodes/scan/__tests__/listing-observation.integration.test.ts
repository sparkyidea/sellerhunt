import { createDbClient } from "@dashseller/db/client";
import { listingPriceMin } from "@dashseller/db/lib/scan-listing-observation";
import {
  scanListing,
  scanListingSnapshot,
  scanListingVariant,
  scanListingVariantSnapshot,
} from "@dashseller/db/schema";
import { migrateTestDb, TEST_DATABASE_URL } from "@dashseller/db/testing";
import { variantPriceRange } from "@dashseller/marketplace-scan/listing-observation";
import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { upsertScanListing } from "../upsert-scan-listing";
import { listing, unit } from "./observation-fixtures";

const connection = createDbClient(TEST_DATABASE_URL);
const database = connection.db;
beforeAll(() => migrateTestDb());
beforeEach(async () => {
  await database.delete(scanListing);
});
afterEach(() => vi.useRealTimers());
afterAll(() => connection.close());

async function observe(input = listing(), fit = true) {
  return await upsertScanListing(database, input, fit);
}

it("saves listing sales and current variants, writing history only on a change", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-01T10:00:00Z"));
  const first = await observe(listing({ soldLast24h: 4, soldLast30Days: 30 }));
  expect(first).toMatchObject({ isNew: true });
  const [before] = await database.select().from(scanListingVariant);
  const [listingBefore] = await database.select().from(scanListing);
  vi.setSystemTime(new Date("2026-09-02T10:00:00Z"));
  const second = await observe(listing({ soldLast24h: 4, soldLast30Days: 30 }));
  expect(second).toEqual({ id: first.id, isNew: false });
  const [after] = await database.select().from(scanListingVariant);
  const [current] = await database.select().from(scanListing);
  expect(after?.id).toBe(before?.id);
  expect(after?.createdAt).toEqual(before?.createdAt);
  expect(current?.createdAt).toEqual(listingBefore?.createdAt);
  expect(current?.lastScannedAt).toEqual(new Date());
  expect(after?.updatedAt).toEqual(current?.lastScannedAt);
  // The second scan measured what the first already recorded, so history
  // still holds one row — stamped with the first scan, not this one.
  const snapshots = await database
    .select()
    .from(scanListingSnapshot)
    .orderBy(scanListingSnapshot.createdAt);
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0]).toMatchObject({
    listingId: first.id,
    itemSold: 200,
    soldLast24h: 4,
    soldLast30Days: 30,
    createdAt: new Date("2026-09-01T10:00:00Z"),
  });
  expect(snapshots[0]).not.toHaveProperty("price");
  expect(current?.lastScannedAt).not.toEqual(snapshots[0]?.createdAt);
  expect(await database.select().from(scanListingVariantSnapshot)).toEqual([
    expect.objectContaining({
      variantId: before?.id,
      price: 2000,
      currency: "USD",
      status: "in_stock",
      createdAt: new Date("2026-09-01T10:00:00Z"),
    }),
  ]);
});

it("appends a second listing row once a counter moves, and none while it holds", async () => {
  await observe();
  await observe();
  await observe(listing({ itemSold: 201 }));
  await observe(listing({ itemSold: 201 }));
  expect(
    (await database.select().from(scanListingSnapshot)).map((s) => s.itemSold)
  ).toEqual([200, 201]);
});

it("tracks a unit's price and stock changes without a row per scan", async () => {
  await observe();
  await observe();
  await observe(listing({ variants: [unit({ price: 1799 })] }));
  await observe(listing({ variants: [unit({ price: 1799 })] }));
  await observe(
    listing({ variants: [unit({ price: 1799, status: "out_of_stock" })] })
  );
  const [variant] = await database.select().from(scanListingVariant);
  const history = await database
    .select()
    .from(scanListingVariantSnapshot)
    .orderBy(scanListingVariantSnapshot.createdAt);
  expect(history.map((row) => [row.price, row.status])).toEqual([
    [2000, "in_stock"],
    [1799, "in_stock"],
    [1799, "out_of_stock"],
  ]);
  expect(history.every((row) => row.variantId === variant?.id)).toBe(true);
});

it("closes a unit's history with the removal that ended it", async () => {
  await observe(
    listing({ variants: [unit(), unit({ reference: "blue", price: 3000 })] })
  );
  const [blue] = await database
    .select()
    .from(scanListingVariant)
    .where(eq(scanListingVariant.reference, "blue"));
  await observe();
  await observe();
  const history = await database
    .select()
    .from(scanListingVariantSnapshot)
    .where(eq(scanListingVariantSnapshot.variantId, blue?.id ?? ""))
    .orderBy(scanListingVariantSnapshot.createdAt);
  // Removed once, not on every later scan that also failed to see it.
  expect(history.map((row) => [row.price, row.status])).toEqual([
    [3000, "in_stock"],
    [3000, "removed"],
  ]);
});

it("stores a simple listing's current price in its stable default variant", async () => {
  const input = listing({
    variants: [unit({ reference: "__default__", attributes: null })],
  });
  await observe(input);
  const [before] = await database.select().from(scanListingVariant);
  await observe({
    ...input,
    variants: [
      unit({ reference: "__default__", attributes: null, price: 2500 }),
    ],
  });
  expect(await database.select().from(scanListingVariant)).toEqual([
    expect.objectContaining({
      id: before?.id,
      reference: "__default__",
      price: 2500,
    }),
  ]);
  // Sales counters never moved, so only the price produced history.
  expect(await database.select().from(scanListingSnapshot)).toHaveLength(1);
  expect(
    (await database.select().from(scanListingVariantSnapshot)).map(
      (row) => row.price
    )
  ).toEqual([2000, 2500]);
});

it("appends one sales snapshot per listing, not per variant, and reuses removed variant identities", async () => {
  await observe(
    listing({ variants: [unit(), unit({ reference: "blue", price: 3000 })] })
  );
  const [blue] = await database
    .select()
    .from(scanListingVariant)
    .where(eq(scanListingVariant.reference, "blue"));
  await observe(listing({ itemSold: 205 }));
  expect(
    await database
      .select()
      .from(scanListingVariant)
      .where(eq(scanListingVariant.reference, "blue"))
  ).toEqual([expect.objectContaining({ id: blue?.id, status: "removed" })]);
  await observe(
    listing({
      itemSold: 210,
      variants: [
        unit(),
        unit({ reference: "blue", price: 3500, status: "out_of_stock" }),
      ],
    })
  );
  expect(
    await database
      .select()
      .from(scanListingVariant)
      .where(eq(scanListingVariant.reference, "blue"))
  ).toEqual([
    expect.objectContaining({
      id: blue?.id,
      status: "out_of_stock",
      price: 3500,
      createdAt: blue?.createdAt,
    }),
  ]);
  expect(
    (await database.select().from(scanListingSnapshot))
      .map((s) => s.itemSold)
      .sort((a, b) => (a ?? 0) - (b ?? 0))
  ).toEqual([200, 205, 210]);
});

it("serializes simultaneous first discovery and reports exactly one insertion", async () => {
  const results = await Promise.all([
    observe(),
    observe(listing({ itemSold: 210, variants: [unit({ price: 2700 })] })),
  ]);
  expect(results.filter((r) => r.isNew)).toHaveLength(1);
  expect(await database.select().from(scanListing)).toHaveLength(1);
  expect(await database.select().from(scanListingVariant)).toHaveLength(1);
  expect(await database.select().from(scanListingSnapshot)).toHaveLength(2);
  const [current] = await database.select().from(scanListing);
  const [variant] = await database.select().from(scanListingVariant);
  expect(variant?.price).toBe(current?.itemSold === 210 ? 2700 : 2000);
});

it("records existing below-threshold listings but does not admit new ones", async () => {
  expect(await observe(listing(), false)).toEqual({ id: null, isNew: false });
  expect(await database.select().from(scanListingSnapshot)).toHaveLength(0);
  const first = await observe();
  expect(
    await observe(
      listing({ itemSold: 0, variants: [unit({ price: 1 })] }),
      false
    )
  ).toEqual({ id: first.id, isNew: false });
  expect(await database.select().from(scanListingSnapshot)).toHaveLength(2);
});

it("rolls back listing, variant and history writes when snapshot persistence fails", async () => {
  await observe();
  const before = {
    listings: await database.select().from(scanListing),
    variants: await database.select().from(scanListingVariant),
    snapshots: await database.select().from(scanListingSnapshot),
    variantSnapshots: await database.select().from(scanListingVariantSnapshot),
  };
  // Test-only failure injection after the current rows have been written.
  await database.execute(
    sql`ALTER TABLE scan_listing_snapshot ADD CONSTRAINT test_reject_sales CHECK (item_sold <> 999)`
  );
  try {
    await expect(
      observe(listing({ itemSold: 999, variants: [unit({ price: 999 })] }))
    ).rejects.toThrow();
    expect(await database.select().from(scanListing)).toEqual(before.listings);
    expect(await database.select().from(scanListingVariant)).toEqual(
      before.variants
    );
    expect(await database.select().from(scanListingSnapshot)).toEqual(
      before.snapshots
    );
    expect(await database.select().from(scanListingVariantSnapshot)).toEqual(
      before.variantSnapshots
    );
  } finally {
    await database.execute(
      sql`ALTER TABLE scan_listing_snapshot DROP CONSTRAINT test_reject_sales`
    );
  }
});

it("keeps unknown sales null and accepts source corrections without fabricating sales", async () => {
  await observe(
    listing({ itemSold: null, soldLast24h: null, soldLast30Days: null })
  );
  await observe(listing({ itemSold: 100 }));
  await observe(listing({ itemSold: 95 }));
  const snapshots = await database.select().from(scanListingSnapshot);
  expect(snapshots).toHaveLength(3);
  expect(snapshots).toContainEqual(
    expect.objectContaining({
      itemSold: null,
      soldLast24h: null,
      soldLast30Days: null,
    })
  );
  expect(await database.select().from(scanListing)).toEqual([
    expect.objectContaining({ itemSold: 95 }),
  ]);
});

it.each([
  listing({ variants: [] }),
  listing({ itemSold: -1 }),
  listing({ soldLast24h: -1 }),
  listing({ soldLast30Days: 0.5 }),
  listing({ variants: [unit({ price: -1 })] }),
  listing({ variants: [unit(), unit()] }),
])("rejects invalid scans without changing current rows or history", async (input) => {
  await observe();
  const before = await database.select().from(scanListing);
  const variants = await database.select().from(scanListingVariant);
  await expect(observe(input)).rejects.toThrow();
  expect(await database.select().from(scanListing)).toEqual(before);
  expect(await database.select().from(scanListingVariant)).toEqual(variants);
  expect(await database.select().from(scanListingSnapshot)).toHaveLength(1);
  expect(await database.select().from(scanListingVariantSnapshot)).toHaveLength(
    1
  );
});

it("cached SQL prices match fetched prices for unknown, mixed-currency and removed units", async () => {
  for (const variant of [
    unit({ price: null }),
    unit({ currency: null }),
    unit({ currency: "" }),
    unit({ currency: "EUR" }),
    unit({ status: "out_of_stock", price: 3000 }),
  ]) {
    const input = listing({
      variants: [unit({ reference: "other" }), variant],
    });
    await observe(input);
    const [row] = await database
      .select({ price: listingPriceMin() })
      .from(scanListing);
    expect(row?.price).toBe(variantPriceRange(input.variants).priceMin);
  }
  await observe(listing({ variants: [unit({ price: 5000 })] }));
  expect(
    await database.select({ price: listingPriceMin() }).from(scanListing)
  ).toEqual([{ price: 5000 }]);
});
