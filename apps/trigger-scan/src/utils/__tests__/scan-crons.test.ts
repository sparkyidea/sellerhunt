import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../../workflows/scan/scan-crons";

const mocks = vi.hoisted(() => ({
  runs: new Map<string, () => Promise<unknown>>(),
  tasks: new Map<string, Record<string, unknown>>(),
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
  metadata: vi.fn(),
}));
vi.mock("@dashseller/db", () => ({ db: mocks.db }));
vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: (options: { id: string; run: () => Promise<unknown> }) => {
      mocks.runs.set(options.id, options.run);
      mocks.tasks.set(options.id, options);
      return options;
    },
  },
  logger: { error: vi.fn(), info: vi.fn() },
  metadata: { set: mocks.metadata.mockReturnThis() },
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

const runCron = () => {
  const run = mocks.runs.get("scan-cron");
  if (!run) {
    throw new Error("scan-cron schedule not registered");
  }
  return run();
};

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

it("registers exactly one scheduled task with no declarative cron", () => {
  expect([...mocks.tasks.keys()]).toEqual(["scan-cron"]);
  expect(mocks.tasks.get("scan-cron")).not.toHaveProperty("cron");
});

it("sweeps listings, sellers, then keywords with task cooldowns, ignoring legacy config", async () => {
  await runCron();
  expect(mocks.configs).toHaveBeenCalledTimes(1);
  expect(mocks.listings).toHaveBeenCalledTimes(2);
  expect(mocks.sellers).toHaveBeenCalledTimes(1);
  expect(mocks.keywords).toHaveBeenCalledTimes(1);
  const queries = mocks.db.where.mock.calls.map(([where]) =>
    new PgDialect().sqlToQuery(where)
  );
  expect(queries.map((q) => [q.params[0], q.params[1]])).toEqual([
    ["ebay", "2026-09-05T06:00:00.000Z"],
    ["shop", "2026-09-05T06:00:00.000Z"],
    ["ebay", "2026-09-04T12:00:00.000Z"],
    ["ebay", "2026-08-29T12:00:00.000Z"],
  ]);
  for (const query of queries) {
    expect(query.sql).toContain('"last_scanned_at" is null');
    expect(query.sql).toContain('"last_scanned_at" <=');
  }
  expect(queries[3]?.sql).toContain('"dead_at" is null');
  expect(mocks.keys).toHaveBeenCalledWith("seller", "ebay", "123456789012");
  expect(
    mocks.metadata.mock.calls.map(([key, value]) => `${key}=${value}`)
  ).toEqual([
    "status=sweeping-listing",
    "status=sweeping-seller",
    "status=sweeping-keyword",
    "status=completed",
  ]);
});

it("does not launch empty batches", async () => {
  mocks.db.limit.mockResolvedValue([]);
  await runCron();
  expect(mocks.listings).not.toHaveBeenCalled();
  expect(mocks.sellers).not.toHaveBeenCalled();
  expect(mocks.keywords).not.toHaveBeenCalled();
});

it("sets priorities on scan runs while preserving seller launch keys", async () => {
  await runCron();
  for (const marketplace of ["ebay", "shop"]) {
    expect(mocks.listings).toHaveBeenCalledWith(
      expect.objectContaining({ marketplace }),
      { priority: 3600 }
    );
  }
  expect(mocks.keywords).toHaveBeenCalledWith(
    expect.objectContaining({ marketplace: "ebay" }),
    { priority: 0 }
  );
  expect(mocks.sellers).toHaveBeenCalledWith([
    {
      payload: expect.objectContaining({ marketplace: "ebay" }),
      options: {
        idempotencyKey: "global",
        idempotencyKeyTTL: "2h",
        priority: 1800,
      },
    },
  ]);
});

it("reports every entity per marketplace, skipping sweeps the adapter lacks", async () => {
  await expect(runCron()).resolves.toEqual({
    results: [
      {
        entity: "listing",
        marketplace: "disabled",
        status: "disabled",
        triggered: 0,
      },
      {
        entity: "listing",
        marketplace: "ebay",
        status: "completed",
        triggered: 1,
      },
      {
        entity: "listing",
        marketplace: "shop",
        status: "completed",
        triggered: 1,
      },
      {
        entity: "seller",
        marketplace: "disabled",
        status: "disabled",
        triggered: 0,
      },
      {
        entity: "seller",
        marketplace: "ebay",
        status: "completed",
        triggered: 1,
      },
      {
        entity: "seller",
        marketplace: "shop",
        status: "unsupported",
        triggered: 0,
      },
      {
        entity: "keyword",
        marketplace: "disabled",
        status: "disabled",
        triggered: 0,
      },
      {
        entity: "keyword",
        marketplace: "ebay",
        status: "completed",
        triggered: 1,
      },
      {
        entity: "keyword",
        marketplace: "shop",
        status: "unsupported",
        triggered: 0,
      },
    ],
  });
  expect(mocks.db.where).toHaveBeenCalledTimes(4);
});

it("continues other marketplaces and sweeps after a dispatch failure", async () => {
  mocks.listings.mockRejectedValueOnce(new Error("unavailable"));
  const result = await runCron();
  expect(result).toMatchObject({
    results: expect.arrayContaining([
      { entity: "listing", marketplace: "ebay", status: "incomplete" },
      {
        entity: "listing",
        marketplace: "shop",
        status: "completed",
        triggered: 1,
      },
      {
        entity: "seller",
        marketplace: "ebay",
        status: "completed",
        triggered: 1,
      },
      {
        entity: "keyword",
        marketplace: "ebay",
        status: "completed",
        triggered: 1,
      },
    ]),
  });
  expect(mocks.sellers).toHaveBeenCalledTimes(1);
  expect(mocks.keywords).toHaveBeenCalledTimes(1);
  expect(mocks.metadata).toHaveBeenLastCalledWith("status", "incomplete");
});
