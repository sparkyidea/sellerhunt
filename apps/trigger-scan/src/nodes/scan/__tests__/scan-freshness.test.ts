import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScanConfig } from "../../../utils/scan-config";
import {
  partitionFreshListings,
  partitionFreshSellers,
} from "../scan-freshness";

const db = vi.hoisted(() => ({
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  where: vi.fn(),
}));
vi.mock("@dashseller/db", () => ({ db }));
vi.mock("@trigger.dev/sdk", () => ({ logger: { info: vi.fn() } }));

const config: ScanConfig = {
  marketplace: "ebay",
  enabled: true,
  keywordBatchSize: 20,
  sellerBatchSize: 20,
  listingBatchSize: 50,
  listingScanBatchSize: 50,
  listingScanDelayMinMs: 0,
  listingScanDelayMaxMs: 0,
  keywordLlmEnabled: true,
  maxSearchPages: 10,
  minItemSold: 100,
  minPriceCents: 1000,
  maxPriceCents: null,
  minSoldLast24h: null,
};
const stored = {
  id: "stored-id",
  reference: "123456789012",
  title: "Camera",
  categoryPath: ["Cameras"],
  price: 2000,
  itemSold: 200,
  soldLast24h: null,
  soldLast30Days: null,
  sellerReference: "seller-1",
};
const storedVerdict = {
  listingId: "123456789012",
  fit: true,
  sellerReference: "seller-1",
  isNew: false,
  scanListingId: "stored-id",
  title: "Camera",
  categoryPath: ["Cameras"],
  variantsDiscovered: 0,
};
const LISTING_CUTOFF = "2026-09-05T06:00:00.000Z";
const SELLER_CUTOFF = "2026-09-04T12:00:00.000Z";

const query = (call = 0) =>
  new PgDialect().sqlToQuery(db.where.mock.calls[call]?.[0]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.UTC(2026, 8, 5, 12)));
  db.where.mockResolvedValue([stored]);
});
afterEach(() => vi.useRealTimers());

it("answers URL, bare, invalid and duplicate inputs in order from one query", async () => {
  const ids = [
    "https://www.ebay.com/itm/123456789012",
    "123456789013",
    "not-a-listing",
    "123456789012",
  ];
  const { verdicts, stale } = await partitionFreshListings("ebay", ids, config);
  expect(stale).toEqual(["123456789013", "not-a-listing"]);
  expect(verdicts).toEqual([storedVerdict, storedVerdict]);
  expect(db.where).toHaveBeenCalledTimes(1);
  expect(db.leftJoin).toHaveBeenCalledTimes(1);
  const { params, sql } = query();
  expect(params).toEqual([
    "ebay",
    "123456789012",
    "123456789013",
    LISTING_CUTOFF,
  ]);
  expect(sql).toContain('"reference" in (');
  expect(sql).toContain('"last_scanned_at" >');
});

it("re-evaluates stored metrics against the current thresholds", async () => {
  const { verdicts } = await partitionFreshListings("ebay", ["123456789012"], {
    ...config,
    minItemSold: 300,
  });
  expect(verdicts).toEqual([
    {
      listingId: "123456789012",
      fit: false,
      sellerReference: "seller-1",
    },
  ]);

  db.where.mockResolvedValue([{ ...stored, title: "" }]);
  const untitled = await partitionFreshListings(
    "ebay",
    ["123456789012"],
    config
  );
  expect(untitled.verdicts).toEqual([
    {
      listingId: "123456789012",
      fit: false,
      sellerReference: "seller-1",
    },
  ]);
  expect(untitled.stale).toEqual([]);
});

it("uses marketplace-specific metrics and scopes the query to the marketplace", async () => {
  db.where.mockResolvedValue([
    { ...stored, itemSold: null, soldLast30Days: 200, sellerReference: null },
  ]);
  const { verdicts } = await partitionFreshListings(
    "shop",
    ["123456789012"],
    config
  );
  expect(verdicts).toEqual([{ ...storedVerdict, sellerReference: null }]);
  expect(query().params[0]).toBe("shop");
});

it("splits more than 1000 references into several queries and keeps input order", async () => {
  const ids = Array.from({ length: 1001 }, (_, i) =>
    String(123_456_789_012 + i)
  );
  db.where.mockResolvedValue([]);
  const { verdicts, stale } = await partitionFreshListings("ebay", ids, config);
  expect(db.where).toHaveBeenCalledTimes(2);
  expect(query(0).params).toHaveLength(1002);
  expect(query(1).params).toEqual(["ebay", ids[1000], LISTING_CUTOFF]);
  expect(verdicts).toEqual([]);
  expect(stale).toEqual(ids);
});

it("does not query for an empty listing batch", async () => {
  await expect(partitionFreshListings("ebay", [], config)).resolves.toEqual({
    verdicts: [],
    stale: [],
  });
  expect(db.select).not.toHaveBeenCalled();
});

it("partitions distinct sellers against the seller cooldown", async () => {
  const lastScannedAt = new Date("2026-09-05T11:00:00Z");
  db.where.mockResolvedValue([{ reference: "a", lastScannedAt }]);
  await expect(partitionFreshSellers("ebay", ["a", "b", "a"])).resolves.toEqual(
    { fresh: [{ reference: "a", lastScannedAt }], stale: ["b"] }
  );
  expect(db.where).toHaveBeenCalledTimes(1);
  expect(db.leftJoin).not.toHaveBeenCalled();
  const { params, sql } = query();
  expect(params).toEqual(["ebay", "a", "b", SELLER_CUTOFF]);
  expect(sql).toContain('"reference" in (');
  expect(sql).toContain('"last_scanned_at" >');
});

it("does not query for an empty seller batch", async () => {
  await expect(partitionFreshSellers("ebay", [])).resolves.toEqual({
    fresh: [],
    stale: [],
  });
  expect(db.select).not.toHaveBeenCalled();
});
