import { ScanRequestError } from "@dashseller/marketplace-scan/errors";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ListingVerdict } from "../../../nodes/scan/listing-verdict";
import type { ScanConfig } from "../../../utils/scan-config";
import {
  ListingBatchError,
  PERSONA_RETRY_MS,
  PersonaScanError,
  scanCatchError,
} from "../../../utils/scan-errors";
import "../scan-listings-by-ids";

interface TaskDefinition {
  id: string;
  queue: unknown;
  retry: { maxAttempts: number };
  run: (payload: Record<string, unknown>) => Promise<ScannedResult>;
}
const mocks = vi.hoisted(() => ({
  runs: new Map<string, TaskDefinition["run"]>(),
  definitions: new Map<string, TaskDefinition>(),
  partitionFreshListings: vi.fn(),
  scanOneListing: vi.fn(),
  resolveKeywordsWithLlm: vi.fn(),
  loadForThisBox: vi.fn(),
  manager: {
    profileId: "profile",
    createScanClient: vi.fn(async () => ({})),
    markUsed: vi.fn(),
    markSoftFailure: vi.fn(),
    markDataAuthFailure: vi.fn(),
  },
}));
// `scan-config` (loaded for its schema) imports the db client; never touched here.
vi.mock("@dashseller/db", () => ({ db: {} }));
vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: (definition: TaskDefinition) => {
    mocks.runs.set(definition.id, definition.run);
    mocks.definitions.set(definition.id, definition);
    return { id: definition.id, batchTrigger: vi.fn() };
  },

  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  metadata: { set: vi.fn().mockReturnThis() },
  tags: { add: vi.fn() },
}));
vi.mock("../../../utils/machine-metadata", () => ({
  setMachineMetadata: vi.fn(),
}));
vi.mock("../../../utils/mobile-profile-manager", () => ({
  MobileProfileTokenManager: { loadForThisBox: mocks.loadForThisBox },
}));
vi.mock("../../../nodes/scan/scan-freshness", () => ({
  partitionFreshListings: mocks.partitionFreshListings,
}));
vi.mock("../../../nodes/scan/scan-one-listing", () => ({
  scanOneListing: mocks.scanOneListing,
}));
vi.mock("../../../nodes/scan/resolve-keywords-with-llm", () => ({
  resolveKeywordsWithLlm: mocks.resolveKeywordsWithLlm,
}));

const config: ScanConfig = {
  marketplace: "ebay",
  enabled: true,
  keywordBatchSize: 20,
  sellerBatchSize: 20,
  listingBatchSize: 50,
  listingScanBatchSize: 50,
  listingScanDelayMinMs: 1,
  listingScanDelayMaxMs: 1,
  keywordLlmEnabled: true,
  maxSearchPages: 10,
  minItemSold: 0,
  minPriceCents: 0,
  maxPriceCents: null,
  minSoldLast24h: null,
};
const ids = ["123456789012", "123456789013", "123456789014"];

function verdict(listingId: string, isNew: boolean): ListingVerdict {
  return {
    listingId,
    fit: true,
    sellerReference: "seller-1",
    isNew,
    scanListingId: `row-${listingId}`,
    title: "Camera",
    categoryPath: null,
    variantsDiscovered: 0,
  };
}

interface ScannedResult {
  fresh: number;
  mode: "scanned";
  notFound: number;
  scanned: number;
  triggered: number;
  unfit: number;
  verdicts: ListingVerdict[];
}

/** Drive the leaf under fake timers so every paced sleep is flushed. */
async function runLeaf(listingIds: string[]): Promise<ScannedResult> {
  const run = mocks.runs.get("scan-listings-by-ids");
  if (!run) {
    throw new Error("scan-listings-by-ids not registered");
  }
  const pending = run({ marketplace: "ebay", listingIds, config }).then(
    (result) => ({ ok: true as const, result }),
    (error: unknown) => ({ ok: false as const, error })
  );
  await vi.runAllTimersAsync();
  const settled = await pending;
  if (!settled.ok) {
    throw settled.error;
  }
  return settled.result;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.loadForThisBox.mockResolvedValue(mocks.manager);
  mocks.scanOneListing.mockImplementation(
    async ({ listingId }: { listingId: string }) => verdict(listingId, true)
  );
  mocks.resolveKeywordsWithLlm.mockResolvedValue({
    resolved: 0,
    unresolved: 0,
    failed: 0,
    llmSkipped: 0,
  });
});
afterEach(() => {
  vi.useRealTimers();
});

it("answers fresh ids from the store and paces only the stale ids", async () => {
  const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
  mocks.partitionFreshListings.mockResolvedValue({
    verdicts: [verdict(ids[0] ?? "", false)],
    stale: [ids[1], ids[2]],
  });
  const result = await runLeaf(ids);
  expect(mocks.partitionFreshListings).toHaveBeenCalledWith(
    "ebay",
    ids,
    config
  );
  expect(mocks.loadForThisBox).toHaveBeenCalledTimes(1);
  expect(mocks.scanOneListing).toHaveBeenCalledTimes(2);
  expect(
    mocks.scanOneListing.mock.calls.map(([call]) => call.listingId)
  ).toEqual([ids[1], ids[2]]);
  expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({
    mode: "scanned",
    fresh: 1,
    notFound: 0,
    scanned: 2,
    triggered: 3,
    unfit: 0,
  });
  expect(result.verdicts).toHaveLength(3);
  expect(result.fresh + result.scanned + result.notFound).toBe(
    result.triggered
  );
  // Only the two inserted listings go to the LLM; the stored verdict is a rescan.
  expect(mocks.resolveKeywordsWithLlm).toHaveBeenCalledWith(
    "ebay",
    config,
    [ids[1], ids[2]].map((id) => ({
      id: `row-${id}`,
      title: "Camera",
      categoryPath: null,
    }))
  );
});

it("loads no persona when every id is fresh", async () => {
  mocks.partitionFreshListings.mockResolvedValue({
    verdicts: ids.map((id) => verdict(id, false)),
    stale: [],
  });
  const result = await runLeaf(ids);
  expect(mocks.loadForThisBox).not.toHaveBeenCalled();
  expect(mocks.scanOneListing).not.toHaveBeenCalled();
  expect(mocks.resolveKeywordsWithLlm).not.toHaveBeenCalled();
  expect(result).toMatchObject({
    mode: "scanned",
    fresh: 3,
    scanned: 0,
    triggered: 3,
  });
  expect(result.fresh + result.scanned + result.notFound).toBe(
    result.triggered
  );
});

it("keeps the failing and untouched IDs in a persona error and uses a 20-minute retry", async () => {
  mocks.partitionFreshListings.mockResolvedValue({ verdicts: [], stale: ids });
  mocks.scanOneListing
    .mockResolvedValueOnce(verdict(ids[0] ?? "", true))
    .mockRejectedValueOnce(
      new ScanRequestError({
        endpoint: "ebay.get-listing",
        status: 429,
        message: "throttled",
      })
    );
  await expect(runLeaf(ids)).rejects.toMatchObject({
    name: "PersonaScanError",
    remaining: ids.slice(1),
  });
  expect(mocks.scanOneListing).toHaveBeenCalledTimes(2);
  expect(mocks.manager.markSoftFailure).toHaveBeenCalledTimes(1);
  expect(mocks.resolveKeywordsWithLlm).toHaveBeenCalledTimes(1);
  expect(
    scanCatchError({ error: new PersonaScanError("throttled", false) })
  ).toEqual({ retryDelayInMs: PERSONA_RETRY_MS });
});

it("finishes healthy siblings and LLM extraction before throwing a parse failure", async () => {
  mocks.partitionFreshListings.mockResolvedValue({ verdicts: [], stale: ids });
  mocks.scanOneListing.mockRejectedValueOnce(new Error("parse failure"));
  await expect(runLeaf(ids)).rejects.toBeInstanceOf(ListingBatchError);
  expect(mocks.scanOneListing).toHaveBeenCalledTimes(3);
  expect(mocks.resolveKeywordsWithLlm).toHaveBeenCalledTimes(1);
  expect(mocks.manager.markSoftFailure).not.toHaveBeenCalled();
});

it("counts only listing-detail 404 as a completed negative", async () => {
  mocks.partitionFreshListings.mockResolvedValue({ verdicts: [], stale: ids });
  mocks.scanOneListing.mockRejectedValueOnce(
    new ScanRequestError({
      endpoint: "ebay.get-listing",
      status: 404,
      message: "gone",
    })
  );
  await expect(runLeaf(ids)).resolves.toMatchObject({
    notFound: 1,
    scanned: 2,
    triggered: 3,
  });
});

it("does not fail marketplace work when LLM extraction fails", async () => {
  mocks.partitionFreshListings.mockResolvedValue({ verdicts: [], stale: ids });
  mocks.resolveKeywordsWithLlm.mockRejectedValueOnce(
    new Error("LLM unavailable")
  );
  await expect(runLeaf(ids)).resolves.toMatchObject({ scanned: 3 });
});

it("registers four attempts and the shared leaf queue", () => {
  expect(mocks.definitions.get("scan-listings-by-ids")?.retry.maxAttempts).toBe(
    4
  );
  expect(mocks.definitions.get("scan-listings-by-ids")?.queue).toEqual({
    name: "scan-listing-leaf",
    concurrencyLimit: 2,
  });
});
