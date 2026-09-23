import { beforeEach, expect, it, vi } from "vitest";
import { runEntityCron } from "../scan-sweep";

const mocks = vi.hoisted(() => ({
  configs: vi.fn(),
  pick: vi.fn(),
  inFlight: vi.fn(),
  listingInFlight: vi.fn(),
  listings: vi.fn(),
  sellers: vi.fn(),
  keywords: vi.fn(),
}));
vi.mock("@trigger.dev/sdk", () => ({
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
beforeEach(() => {
  vi.resetAllMocks();
  mocks.configs.mockResolvedValue([config]);
  mocks.pick.mockResolvedValue([]);
  mocks.inFlight.mockResolvedValue(new Set());
  mocks.listingInFlight.mockResolvedValue(false);
});

it("sweeps only its own entity and leaves the other two alone", async () => {
  mocks.pick.mockResolvedValue(["camera"]);
  const result = await runEntityCron("keyword");
  expect(result.results).toEqual([
    {
      entity: "keyword",
      marketplace: "ebay",
      status: "completed",
      triggered: 1,
    },
  ]);
  expect(mocks.pick).toHaveBeenCalledTimes(1);
  expect(mocks.pick).toHaveBeenCalledWith("keyword", "ebay", 20);
  expect(mocks.keywords).toHaveBeenCalledWith(
    { marketplace: "ebay", keywords: ["camera"], config },
    { tags: ["marketplace_ebay"] }
  );
  expect(mocks.listings).not.toHaveBeenCalled();
  expect(mocks.sellers).not.toHaveBeenCalled();
});

it("suppresses overlapping cron listing work", async () => {
  mocks.listingInFlight.mockResolvedValue(true);
  mocks.pick.mockResolvedValue(["busy"]);
  const result = await runEntityCron("listing");
  expect(result.results[0]).toMatchObject({
    status: "skipped",
    reason: "in-flight",
  });
  expect(mocks.pick).not.toHaveBeenCalled();
  expect(mocks.listings).not.toHaveBeenCalled();
});

it("drops references whose parent launch is already in flight", async () => {
  mocks.inFlight.mockResolvedValue(new Set(["busy"]));
  mocks.pick.mockResolvedValue(["busy"]);
  const result = await runEntityCron("seller");
  expect(result.results[0]).toMatchObject({
    status: "completed",
    triggered: 0,
  });
  expect(mocks.sellers).not.toHaveBeenCalled();
});

it("leaves the sweep for the next tick after a run-lookup failure", async () => {
  mocks.inFlight.mockRejectedValueOnce(new Error("lookup"));
  const result = await runEntityCron("seller");
  expect(result.results[0]).toMatchObject({
    status: "skipped",
    reason: "in-flight-unknown",
  });
  expect(mocks.sellers).not.toHaveBeenCalled();
});

it("splits API batches at 1000 items, caller-chunks listings, and never sends empty batches", async () => {
  const references = Array.from({ length: 2001 }, (_, i) => `${i}`);
  mocks.pick.mockResolvedValue(references);
  await runEntityCron("listing");
  expect(mocks.listings.mock.calls.map(([items]) => items.length)).toEqual([
    1000, 1,
  ]);
  expect(mocks.listings.mock.calls[0]?.[0][0]).toMatchObject({
    payload: { listingIds: ["0", "1"] },
    options: { tags: ["marketplace_ebay", "scan_source_cron"] },
  });
});

it("checks capabilities and enablement before doing lookups or selection", async () => {
  mocks.configs.mockResolvedValue([
    { ...config, enabled: false },
    { ...config, marketplace: "shop" },
  ]);
  const result = await runEntityCron("keyword");
  expect(result.results).toEqual([
    {
      entity: "keyword",
      marketplace: "ebay",
      status: "disabled",
      triggered: 0,
    },
    {
      entity: "keyword",
      marketplace: "shop",
      status: "unsupported",
      triggered: 0,
    },
  ]);
  expect(mocks.inFlight).not.toHaveBeenCalled();
  expect(mocks.pick).not.toHaveBeenCalled();
});

it("continues other marketplaces after dispatch fails", async () => {
  mocks.configs.mockResolvedValue([config, { ...config, marketplace: "shop" }]);
  mocks.pick.mockResolvedValue(["reference"]);
  mocks.listings.mockRejectedValueOnce(new Error("dispatch unavailable"));
  const result = await runEntityCron("listing");
  expect(result.results).toEqual([
    { entity: "listing", marketplace: "ebay", status: "incomplete" },
    {
      entity: "listing",
      marketplace: "shop",
      status: "completed",
      triggered: 1,
    },
  ]);
});
