import { beforeEach, expect, it, vi } from "vitest";
import "../scan-crons";

const mocks = vi.hoisted(() => ({
  definitions: new Map<
    string,
    {
      run: () => Promise<{
        results: {
          entity: string;
          marketplace: string;
          status: string;
          reason?: string;
        }[];
      }>;
    }
  >(),
  configs: vi.fn(),
  pick: vi.fn(),
  inFlight: vi.fn(),
  listingInFlight: vi.fn(),
  listings: vi.fn(),
  sellers: vi.fn(),
  keywords: vi.fn(),
}));
vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: (definition: {
      id: string;
      run: () => Promise<{
        results: {
          entity: string;
          marketplace: string;
          status: string;
          reason?: string;
        }[];
      }>;
    }) => {
      mocks.definitions.set(definition.id, definition);
      return definition;
    },
  },
  metadata: { set: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../../utils/machine-metadata", () => ({
  setMachineMetadata: vi.fn(),
}));
vi.mock("../../../utils/scan-config", () => ({
  loadAllScanConfigs: mocks.configs,
}));
vi.mock("../../../nodes/scan/scan-dispatch", () => ({ pickStale: mocks.pick }));
vi.mock("../../../utils/scan-in-flight", () => ({
  inFlight: mocks.inFlight,
  listingSweepInFlight: mocks.listingInFlight,
}));
vi.mock("../scan-listings-by-ids", () => ({
  scanListingsByIds: { batchTrigger: mocks.listings },
}));
vi.mock("../scan-listings-by-seller", () => ({
  scanListingsBySeller: { batchTrigger: mocks.sellers },
}));
vi.mock("../scan-listings-by-keywords", () => ({
  scanListingsByKeywords: { trigger: mocks.keywords },
}));
const config = {
  marketplace: "ebay",
  enabled: true,
  listingBatchSize: 50,
  sellerBatchSize: 20,
  keywordBatchSize: 20,
  listingScanBatchSize: 2,
};
function run() {
  const cron = mocks.definitions.get("scan-cron");
  if (!cron) {
    throw new Error("Missing cron");
  }
  return cron.run();
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.configs.mockResolvedValue([config]);
  mocks.pick.mockResolvedValue([]);
  mocks.inFlight.mockResolvedValue(new Set());
  mocks.listingInFlight.mockResolvedValue(false);
});
it("suppresses busy parent launches and overlapping cron listing work", async () => {
  mocks.listingInFlight.mockResolvedValue(true);
  mocks.inFlight.mockResolvedValue(new Set(["busy"]));
  mocks.pick.mockResolvedValue(["busy"]);
  const result = await run();
  expect(result.results[0]).toMatchObject({
    status: "skipped",
    reason: "in-flight",
  });
  expect(mocks.pick).toHaveBeenCalledWith("seller", "ebay", 20);
  expect(mocks.pick).toHaveBeenCalledWith("keyword", "ebay", 20);
  expect(mocks.listings).not.toHaveBeenCalled();
  expect(mocks.sellers).not.toHaveBeenCalled();
  expect(mocks.keywords).not.toHaveBeenCalled();
});

it("continues independent sweeps after a run-lookup failure", async () => {
  mocks.inFlight.mockRejectedValueOnce(new Error("lookup"));
  mocks.pick.mockImplementation(async (entity: string) =>
    entity === "keyword" ? ["camera"] : []
  );
  const result = await run();
  expect(result.results.find((item) => item.entity === "seller")).toMatchObject(
    { status: "skipped", reason: "in-flight-unknown" }
  );
  expect(mocks.keywords).toHaveBeenCalledWith(
    { marketplace: "ebay", keywords: ["camera"], config },
    { tags: ["marketplace_ebay"] }
  );
});
it("splits API batches at 1000 items, caller-chunks listings, and never sends empty batches", async () => {
  const references = Array.from({ length: 2001 }, (_, i) => `${i}`);
  mocks.pick.mockImplementation(async (entity: string) =>
    entity === "listing" ? references : []
  );
  await run();
  expect(mocks.listings.mock.calls.map(([items]) => items.length)).toEqual([
    1000, 1,
  ]);
  expect(mocks.listings.mock.calls[0]?.[0][0]).toMatchObject({
    payload: { listingIds: ["0", "1"] },
    options: { tags: ["marketplace_ebay", "scan_source_cron"] },
  });
  expect(mocks.sellers).not.toHaveBeenCalled();
  expect(mocks.keywords).not.toHaveBeenCalled();
});
it("checks capabilities and enablement before doing lookups or selection", async () => {
  mocks.configs.mockResolvedValue([
    { ...config, enabled: false },
    { ...config, marketplace: "shop" },
  ]);
  const result = await run();
  expect(
    result.results
      .filter((item) => item.marketplace === "ebay")
      .every((item) => item.status === "disabled")
  ).toBe(true);
  expect(
    result.results.find(
      (item) => item.marketplace === "shop" && item.entity === "keyword"
    )?.status
  ).toBe("unsupported");
  expect(mocks.inFlight).not.toHaveBeenCalled();
});

it("continues marketplaces and sweeps after dispatch fails", async () => {
  mocks.configs.mockResolvedValue([config, { ...config, marketplace: "shop" }]);
  mocks.pick.mockResolvedValue(["reference"]);
  mocks.listings.mockRejectedValueOnce(new Error("dispatch unavailable"));
  const result = await run();
  expect(result.results).toEqual(
    expect.arrayContaining([
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
    ])
  );
});
it("registers one cron task without activating a schedule", () => {
  expect([...mocks.definitions.keys()]).toEqual(["scan-cron"]);
  expect(mocks.definitions.get("scan-cron")).not.toHaveProperty("cron");
});
