import { db } from "@dashseller/db";
import {
  scanListing,
  scanListingSnapshot,
  scanListingVariant,
} from "@dashseller/db/schema";
import { migrateTestDb } from "@dashseller/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { createCallerFactory } from "../../index";
import { appRouter } from "../index";

const caller = createCallerFactory(appRouter)({
  session: null,
  encryptionKey: "integration-only",
}).scanListing;
const marketplace = "itest-variant-reads";
let listingId: string;
let variantId: string;

beforeAll(async () => {
  await migrateTestDb();
});
beforeEach(async () => {
  listingId = crypto.randomUUID();
  variantId = crypto.randomUUID();
  await db.insert(scanListing).values({
    id: listingId,
    marketplace,
    reference: listingId,
    title: "Research listing",
  });
  await db.insert(scanListingVariant).values([
    {
      id: variantId,
      listingId,
      reference: "a",
      price: 100,
      currency: "USD",
      status: "in_stock",
    },
    {
      listingId,
      reference: "b",
      price: 300,
      currency: "USD",
      status: "out_of_stock",
    },
    {
      listingId,
      reference: "c",
      price: 999,
      currency: "USD",
      status: "removed",
    },
  ]);
});
afterEach(async () => {
  await db.delete(scanListing).where(eq(scanListing.marketplace, marketplace));
});
afterAll(async () => {
  await db.$client.end();
});

it("excludes removed units but retains in-stock/out-of-stock units in detail and gallery ranges", async () => {
  const detail = await caller.get({ id: listingId });
  expect(detail).toMatchObject({
    priceMin: 100,
    priceMax: 300,
    currency: "USD",
  });
  expect(detail.variants.map((v) => v.reference).sort()).toEqual(["a", "b"]);
  const page = await caller.getMany({
    marketplace,
    rollups: [
      { key: "variants.price", extrasKey: "unitMax", calculation: "max" },
    ],
  });
  expect(page.items).toHaveLength(1);
  expect(page.items[0]).toMatchObject({
    priceMin: 100,
    priceMax: 300,
    unitMax: 999,
  });
  await db
    .update(scanListingVariant)
    .set({ currency: "EUR" })
    .where(eq(scanListingVariant.id, variantId));
  expect(await caller.get({ id: listingId })).toMatchObject({
    priceMin: null,
    priceMax: null,
    currency: null,
  });
});

it("includes all related variants in positive, negative and quantified filters", async () => {
  for (const condition of ["eq", "ne"] as const) {
    const page = await caller.getMany({
      marketplace,
      filter: [{ property: "variants.price", condition, value: 999 }],
    });
    expect(page.items).toHaveLength(condition === "eq" ? 1 : 0);
  }
  for (const quantifier of ["any", "none", "every"] as const) {
    const page = await caller.getMany({
      marketplace,
      filter: [
        { property: "variants.price", condition: "lt", value: 400, quantifier },
      ],
    });
    expect(page.items).toHaveLength(quantifier === "any" ? 1 : 0);
  }
});

it("includes removed variants in rollup filters before pagination", async () => {
  const page = await caller.getMany({
    marketplace,
    limit: 1,
    rollups: [
      { key: "variants.price", extrasKey: "unitMax", calculation: "max" },
    ],
    filter: [{ property: "variants.price", condition: "lt", value: 400 }],
  });
  expect(page.items).toEqual([]);
});

it("includes removed variants in relation filters when counting groups", async () => {
  const result = await caller.getGroup({
    marketplace,
    groupBy: { propertyId: "marketplace", propertyType: "text" },
    filter: [{ property: "variants.price", condition: "eq", value: 999 }],
  });
  expect(result.counts).toEqual({
    [marketplace]: { count: 1, hasMore: false },
  });
  const current = await caller.getGroup({
    marketplace,
    groupBy: { propertyId: "marketplace", propertyType: "text" },
    filter: [{ property: "variants.price", condition: "eq", value: 300 }],
  });
  expect(current.counts).toEqual({
    [marketplace]: { count: 1, hasMore: false },
  });
});

it("paginates history newest-first without overlap and applies date bounds", async () => {
  const base = new Date("2026-09-01T00:00:00Z");
  const at = (seconds: number) => new Date(base.getTime() + seconds * 1000);
  await db.insert(scanListingSnapshot).values(
    [
      { itemSold: null, createdAt: at(0) },
      { itemSold: 10, createdAt: at(1) },
      { itemSold: 15, createdAt: at(2) },
      { itemSold: 20, createdAt: at(3) },
    ].map((row, index) => ({
      id: `${listingId}-${index}`,
      listingId,
      soldLast24h: index,
      soldLast30Days: null,
      ...row,
    }))
  );
  const first = await caller.getListingHistory({ listingId, limit: 2 });
  expect(first.items.map((row) => row.id)).toEqual([
    `${listingId}-3`,
    `${listingId}-2`,
  ]);
  expect(first.items.map((row) => row.salesDelta)).toEqual([5, 5]);
  expect(first.items[0]).toMatchObject({
    soldLast24h: 3,
    soldLast30Days: null,
  });
  const second = await caller.getListingHistory({
    listingId,
    limit: 2,
    cursor: first.nextCursor,
  });
  expect(second.items.map((row) => row.salesDelta)).toEqual([null, null]);
  expect(
    new Set([...first.items, ...second.items].map((row) => row.id)).size
  ).toBe(4);
  expect(second.nextCursor).toBeNull();
  expect(
    (await caller.getListingHistory({ listingId, from: at(4) })).items
  ).toEqual([]);
  expect(
    (await caller.getListingHistory({ listingId, to: at(0) })).items
  ).toHaveLength(1);
});

it("returns empty history for an unscanned listing but rejects unknown listings and invalid input", async () => {
  expect((await caller.getListingHistory({ listingId })).items).toEqual([]);
  await expect(
    caller.getListingHistory({ listingId: "other" })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    caller.getListingHistory({ listingId, limit: 501 })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller.getListingHistory({
      listingId,
      from: new Date("2026-09-02"),
      to: new Date("2026-09-01"),
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
