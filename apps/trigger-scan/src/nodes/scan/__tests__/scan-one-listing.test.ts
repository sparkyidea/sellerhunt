import type { ScanGetListingResult } from "@dashseller/marketplace-scan/types";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScanConfig } from "../../../utils/scan-config";
import { scanOneListing } from "../scan-one-listing";

const db = vi.hoisted(() => ({
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn(),
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
const listing = {
  id: "stored-id",
  title: "Camera",
  categoryPath: ["Cameras"],
  price: 2000,
  itemSold: 200,
  soldLast24h: null,
  soldLast30Days: null,
};
const client = { getListing: vi.fn<() => Promise<ScanGetListingResult>>() };
const manager = { markUsed: vi.fn() };
const params = {
  client,
  manager,
  config,
  marketplace: "ebay",
  listingId: "https://www.ebay.com/itm/123456789012",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.UTC(2026, 8, 5, 12)));
  db.limit.mockResolvedValue([{ listing, sellerReference: "seller-1" }]);
  client.getListing.mockRejectedValue(new Error("detail requested"));
});
afterEach(() => vi.useRealTimers());

it("accounts for a fresh listing without fetching or writing, retaining seller discovery", async () => {
  const verdict = await scanOneListing(params);
  expect(verdict).toMatchObject({
    listingId: "123456789012",
    fit: true,
    sellerReference: "seller-1",
    isNew: false,
    scanListingId: "stored-id",
  });
  expect(client.getListing).not.toHaveBeenCalled();
  expect(manager.markUsed).not.toHaveBeenCalled();
  const query = new PgDialect().sqlToQuery(db.where.mock.calls[0]?.[0]);
  expect(query.params).toEqual([
    "ebay",
    "123456789012",
    "2026-09-05T06:00:00.000Z",
  ]);
  expect(query.sql).toContain('"last_scanned_at" >');
});

it("re-evaluates stored metrics against the current thresholds without fetching", async () => {
  const verdict = await scanOneListing({
    ...params,
    config: { ...config, minItemSold: 300 },
  });
  expect(verdict).toEqual({
    listingId: "123456789012",
    fit: false,
    sellerReference: "seller-1",
  });
  expect(client.getListing).not.toHaveBeenCalled();
});

it("fetches normalized IDs when the freshness query finds no row", async () => {
  db.limit.mockResolvedValue([]);
  await expect(scanOneListing(params)).rejects.toThrow("detail requested");
  expect(client.getListing).toHaveBeenCalledWith({ listingId: "123456789012" });
});

it("uses marketplace-specific metrics and scopes the cache lookup", async () => {
  db.limit.mockResolvedValue([
    { listing: { ...listing, soldLast30Days: 200 }, sellerReference: null },
  ]);
  expect(
    await scanOneListing({ ...params, marketplace: "shop" })
  ).toMatchObject({ fit: true, sellerReference: null });
  expect(
    new PgDialect().sqlToQuery(db.where.mock.calls[0]?.[0]).params[0]
  ).toBe("shop");
});

it("ignores legacy cooldown overrides and keeps fresh listings cached", async () => {
  const legacyConfig = { ...config, listingRescanAfter: 0 };
  expect(
    await scanOneListing({ ...params, config: legacyConfig })
  ).toMatchObject({ fit: true, isNew: false });
  expect(client.getListing).not.toHaveBeenCalled();
  expect(
    new PgDialect().sqlToQuery(db.where.mock.calls[0]?.[0]).params[2]
  ).toBe("2026-09-05T06:00:00.000Z");
});
