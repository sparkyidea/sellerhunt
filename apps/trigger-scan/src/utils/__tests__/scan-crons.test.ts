import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../../workflows/scan/scan-crons";

const mocks = vi.hoisted(() => ({
  runs: new Map<string, () => Promise<unknown>>(),
  configs: vi.fn(),
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  },
  listings: vi.fn(),
  sellers: vi.fn(),
  keywords: vi.fn(),
  keys: vi.fn(),
}));
vi.mock("@dashseller/db", () => ({ db: mocks.db }));
vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: (options: { id: string; run: () => Promise<unknown> }) => {
      mocks.runs.set(options.id, options.run);
      return options;
    },
  },
  logger: { error: vi.fn(), info: vi.fn() },
  metadata: { set: vi.fn().mockReturnThis() },
}));
vi.mock("../machine-metadata", () => ({
  setMachineMetadata: vi.fn(),
}));
vi.mock("../scan-config", () => ({
  loadAllScanConfigs: mocks.configs,
}));
vi.mock("../scan-launch-options", () => ({
  scanLaunchOptions: mocks.keys,
}));
vi.mock("../../workflows/scan/scan-listings-by-ids", () => ({
  scanListingsByIds: { trigger: mocks.listings },
}));
vi.mock("../../workflows/scan/scan-listings-by-keywords", () => ({
  scanListingsByKeywords: { trigger: mocks.keywords },
}));
vi.mock("../../workflows/scan/scan-listings-by-seller", () => ({
  scanListingsBySeller: { batchTrigger: mocks.sellers },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-05T12:00:00Z"));
  mocks.configs.mockResolvedValue(
    ["disabled", "ebay", "shop"].map((marketplace) => ({
      marketplace,
      enabled: marketplace !== "disabled",
      listingRescanAfter: 0,
      sellerRescanAfter: 0,
      keywordRescanAfter: 0,
      listingBatchSize: 50,
      sellerBatchSize: 20,
      keywordBatchSize: 20,
    }))
  );
  mocks.db.limit.mockResolvedValue([
    { reference: "123456789012", keyword: "camera" },
  ]);
  mocks.keys.mockResolvedValue({
    idempotencyKey: "global",
    idempotencyKeyTTL: "2h",
  });
});

afterEach(() => vi.useRealTimers());

it.each([
  ["listing", "2026-09-05T06:00:00.000Z"],
  ["seller", "2026-09-04T12:00:00.000Z"],
  ["keyword", "2026-08-29T12:00:00.000Z"],
])("dispatches stale %s work using task cooldowns, ignoring legacy config", async (entity, cutoff) => {
  await mocks.runs.get(`scan-${entity}s-cron`)?.();
  const dispatched = {
    listing: mocks.listings,
    seller: mocks.sellers,
    keyword: mocks.keywords,
  };
  for (const [name, mock] of Object.entries(dispatched)) {
    expect(mock).toHaveBeenCalledTimes(name === entity ? 2 : 0);
  }
  const queries = mocks.db.where.mock.calls.map(([where]) =>
    new PgDialect().sqlToQuery(where)
  );
  expect(queries.map((q) => q.params[0])).toEqual(["ebay", "shop"]);
  expect(queries.map((q) => q.params[1])).toEqual([cutoff, cutoff]);
  expect(queries[0]?.sql).toContain('"last_scanned_at" is null');
  expect(queries[0]?.sql).toContain('"last_scanned_at" <=');
  if (entity === "keyword") {
    expect(queries[0]?.sql).toContain('"dead_at" is null');
  }
  if (entity === "seller") {
    expect(mocks.keys).toHaveBeenCalledWith("seller", "shop", "123456789012");
  }
});

it("does not launch empty batches", async () => {
  mocks.db.limit.mockResolvedValue([]);
  for (const run of mocks.runs.values()) {
    await run();
  }
  expect(mocks.listings).not.toHaveBeenCalled();
  expect(mocks.sellers).not.toHaveBeenCalled();
  expect(mocks.keywords).not.toHaveBeenCalled();
});

it("sets priorities on scan runs while preserving seller launch keys", async () => {
  for (const run of mocks.runs.values()) {
    await run();
  }
  for (const marketplace of ["ebay", "shop"]) {
    expect(mocks.listings).toHaveBeenCalledWith(
      expect.objectContaining({ marketplace }),
      { priority: 3600 }
    );
    expect(mocks.keywords).toHaveBeenCalledWith(
      expect.objectContaining({ marketplace }),
      { priority: 0 }
    );
    expect(mocks.sellers).toHaveBeenCalledWith([
      {
        payload: expect.objectContaining({ marketplace }),
        options: {
          idempotencyKey: "global",
          idempotencyKeyTTL: "2h",
          priority: 1800,
        },
      },
    ]);
  }
});

it("continues other marketplaces after a dispatch failure", async () => {
  mocks.listings.mockRejectedValueOnce(new Error("unavailable"));
  const result = await mocks.runs.get("scan-listings-cron")?.();
  expect(result).toMatchObject({
    results: [
      { marketplace: "disabled", status: "disabled" },
      { marketplace: "ebay", status: "incomplete" },
      { marketplace: "shop", status: "completed", triggered: 1 },
    ],
  });
});
