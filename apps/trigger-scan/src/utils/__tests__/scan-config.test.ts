import { expect, it, vi } from "vitest";
import { loadScanConfig, scanConfigSchema } from "../scan-config";

const db = vi.hoisted(() => ({
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn(),
}));
vi.mock("@dashseller/db", () => ({ db }));

it("loads configuration without cooldown columns and ignores old inline fields", async () => {
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
