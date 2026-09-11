import { expect, it, vi } from "vitest";
import {
  loadAllScanConfigs,
  loadScanConfig,
  scanConfigSchema,
} from "../scan-config";

const db = vi.hoisted(() => ({
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn(),
}));
vi.mock("@dashseller/db", () => ({ db }));

const row = {
  marketplace: "ebay",
  enabled: true,
  keywordBatchSize: 20,
  sellerBatchSize: 20,
  listingBatchSize: 50,
  listingScanBatchSize: 50,
  listingScanDelayMinMs: 200,
  listingScanDelayMaxMs: 800,
  keywordLlmEnabled: true,
  maxSearchPages: 10,
  minItemSold: 100,
  minPriceCents: 1000,
  maxPriceCents: null,
  minSoldLast24h: null,
};

it("loads configuration without cooldown columns and ignores old inline fields", async () => {
  db.limit.mockResolvedValue([row]);
  const config = await loadScanConfig("ebay");
  expect(
    scanConfigSchema.parse({
      ...row,
      listingRescanAfter: 0,
      sellerRescanAfter: 1,
      keywordRescanAfter: 2,
    })
  ).toEqual(config);
  expect(config).toMatchObject({ listingBatchSize: 50, minItemSold: 100 });
  for (const field of [
    "listingRescanAfter",
    "sellerRescanAfter",
    "keywordRescanAfter",
  ]) {
    expect(config).not.toHaveProperty(field);
  }
});

const invalidCronBatches = [
  "keywordBatchSize",
  "sellerBatchSize",
  "listingBatchSize",
].flatMap((field) => [-1, 0, 1, 2.5].map((value) => ({ field, value })));

it.each(
  invalidCronBatches
)("rejects $field=$value in inline config and both database loaders", async ({
  field,
  value,
}) => {
  const invalid = { ...row, [field]: value };
  expect(() => scanConfigSchema.parse(invalid)).toThrow(field);
  db.limit.mockResolvedValueOnce([invalid]);
  await expect(loadScanConfig("ebay")).rejects.toThrow(field);
  db.from.mockResolvedValueOnce([invalid]);
  await expect(loadAllScanConfigs()).rejects.toThrow(field);
});

it("accepts minimum cron batches while preserving single-listing leaf batches", async () => {
  const config = {
    ...row,
    keywordBatchSize: 2,
    sellerBatchSize: 2,
    listingBatchSize: 2,
    listingScanBatchSize: 1,
  };
  expect(scanConfigSchema.parse(config)).toEqual(config);
  db.limit.mockResolvedValueOnce([config]);
  await expect(loadScanConfig("ebay")).resolves.toEqual(config);
  db.from.mockResolvedValueOnce([config]);
  await expect(loadAllScanConfigs()).resolves.toEqual([config]);
});
