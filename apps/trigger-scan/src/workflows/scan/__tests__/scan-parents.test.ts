import { ScanRequestError } from "@dashseller/marketplace-scan/errors";
import { beforeEach, expect, it, vi } from "vitest";
import {
  PERSONA_RETRY_MS,
  ScanIncompleteError,
  scanCatchError,
} from "../../../utils/scan-errors";
import "../scan-listings-by-keyword";
import "../scan-listings-by-keywords";

interface Definition {
  id: string;
  retry: { maxAttempts: number };
  run: (
    payload: Record<string, unknown>,
    context: { ctx: { run: { id: string; createdAt: Date } } }
  ) => Promise<unknown>;
}
const mocks = vi.hoisted(() => ({
  definitions: new Map<string, Definition>(),
  metadata: { set: vi.fn() },
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
  client: {
    searchListings: vi.fn(),
    getSeller: vi.fn(),
    getSellerListings: vi.fn(),
  },
  manager: {
    profileId: "profile",
    createScanClient: vi.fn(),
    markUsed: vi.fn(),
    markSoftFailure: vi.fn(),
    markDataAuthFailure: vi.fn(),
  },
  load: vi.fn(),
  listings: vi.fn(),
  sellers: vi.fn(),
  keywords: vi.fn(),
  partitionListings: vi.fn(),
  partitionSellers: vi.fn(),
  inFlight: vi.fn(),
  older: vi.fn(),
  register: vi.fn(),
  markKeyword: vi.fn(),
  upsertSeller: vi.fn(),
}));
vi.mock("@dashseller/db", () => ({ db: mocks.db }));
vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: (definition: Definition) => {
    mocks.definitions.set(definition.id, definition);
    return {
      id: definition.id,
      batchTriggerAndWait: mocks.sellers,
      batchTrigger: mocks.keywords,
    };
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  metadata: mocks.metadata,
  tags: { add: vi.fn() },
}));
vi.mock("../../../utils/machine-metadata", () => ({
  setMachineMetadata: vi.fn(),
}));
vi.mock("../../../utils/mobile-profile-manager", () => ({
  MobileProfileTokenManager: { loadForThisBox: mocks.load },
}));
vi.mock("../../../utils/scan-in-flight", () => ({
  inFlight: mocks.inFlight,
  olderSiblingRunning: mocks.older,
}));
vi.mock("../../../nodes/scan/scan-freshness", () => ({
  partitionFreshListings: mocks.partitionListings,
  partitionFreshSellers: mocks.partitionSellers,
}));
vi.mock("../../../nodes/scan/upsert-scan-keyword", () => ({
  registerScanKeywords: mocks.register,
  markKeywordScanned: mocks.markKeyword,
}));
vi.mock("../../../nodes/scan/upsert-scan-seller", () => ({
  upsertScanSeller: mocks.upsertSeller,
}));
vi.mock("../scan-listings-by-ids", () => ({
  scanListingsByIds: { batchTriggerAndWait: mocks.listings },
}));
const config = {
  marketplace: "ebay",
  enabled: true,
  keywordBatchSize: 20,
  sellerBatchSize: 20,
  listingBatchSize: 50,
  listingScanBatchSize: 1,
  listingScanDelayMinMs: 0,
  listingScanDelayMaxMs: 0,
  keywordLlmEnabled: false,
  maxSearchPages: 2,
  minItemSold: 0,
  minPriceCents: 0,
  maxPriceCents: null,
  minSoldLast24h: null,
};
const listingId = "123456789012";
const verdict = {
  listingId,
  fit: true,
  sellerReference: "seller-1",
  isNew: false,
  scanListingId: "row",
  title: "Camera",
  categoryPath: null,
  variantsDiscovered: 0,
};
function run(
  entity: string,
  payload: Record<string, unknown> = {},
  id = "run_self"
) {
  const definition = mocks.definitions.get(`scan-listings-by-${entity}`);
  if (!definition) {
    throw new Error(`Missing task ${entity}`);
  }
  return definition.run(
    {
      marketplace: "ebay",
      keyword: "camera",
      keywords: ["camera"],
      sellerId: "seller-1",
      config,
      ...payload,
    },
    { ctx: { run: { id, createdAt: new Date("2026-09-09T12:00Z") } } }
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.metadata.set.mockReturnThis();
  mocks.db.select.mockReturnThis();
  mocks.db.from.mockReturnThis();
  mocks.db.where.mockReturnThis();
  mocks.db.update.mockReturnThis();
  mocks.db.set.mockReturnThis();
  mocks.db.limit.mockResolvedValue([]);
  mocks.load.mockResolvedValue(mocks.manager);
  mocks.manager.createScanClient.mockResolvedValue(mocks.client);
  mocks.client.searchListings.mockResolvedValue({
    listings: [{ listingId }],
    hasMore: false,
  });
  mocks.client.getSeller.mockResolvedValue({ seller: { storeName: "Seller" } });
  mocks.client.getSellerListings.mockResolvedValue({
    listings: [{ listingId }],
    hasMore: false,
  });
  mocks.partitionListings.mockResolvedValue({ verdicts: [verdict], stale: [] });
  mocks.partitionSellers.mockImplementation(
    async (_m: string, references: string[]) => ({
      fresh: [],
      stale: references,
    })
  );
  mocks.inFlight.mockResolvedValue(new Set());
  mocks.older.mockResolvedValue(null);
  mocks.listings.mockResolvedValue({
    runs: [{ ok: true, output: { verdicts: [verdict] } }],
  });
  mocks.sellers.mockResolvedValue({
    runs: [{ ok: true, output: { status: "completed" } }],
  });
});

it("waits for fitting sellers before marking a keyword complete", async () => {
  await expect(run("keyword")).resolves.toMatchObject({
    status: "completed",
    sellersLaunched: 1,
  });
  expect(mocks.listings).not.toHaveBeenCalled();
  expect(mocks.sellers).toHaveBeenCalledWith([
    {
      payload: { marketplace: "ebay", sellerId: "seller-1", config },
      options: { tags: ["marketplace_ebay", "scan_seller_seller-1"] },
    },
  ]);
  expect(mocks.markKeyword.mock.invocationCallOrder[0]).toBeGreaterThan(
    mocks.sellers.mock.invocationCallOrder[0] ?? 0
  );
});
it("launches sellers from healthy listing siblings before reporting another leaf's failure", async () => {
  mocks.partitionListings.mockResolvedValue({
    verdicts: [],
    stale: [listingId, "123456789013"],
  });
  mocks.listings.mockResolvedValue({
    runs: [
      { ok: false, error: { message: "bad listing" } },
      { ok: true, output: { verdicts: [verdict] } },
    ],
  });
  await expect(run("keyword")).rejects.toMatchObject({
    reason: "children-incomplete",
  });
  expect(mocks.sellers).toHaveBeenCalledTimes(1);
  expect(mocks.markKeyword).not.toHaveBeenCalled();
});
it("does not complete after seller lookup failure", async () => {
  mocks.inFlight.mockRejectedValue(new Error("lookup unavailable"));
  await expect(run("keyword")).rejects.toMatchObject({
    reason: "children-incomplete",
  });
  expect(mocks.sellers).not.toHaveBeenCalled();
  expect(mocks.markKeyword).not.toHaveBeenCalled();
});
it("keeps prelaunch in-flight sellers unresolved and rechecks freshness", async () => {
  mocks.inFlight.mockResolvedValue(new Set(["seller-1"]));
  await expect(run("keyword")).rejects.toMatchObject({
    reason: "in-flight",
    details: { sellersDeferred: ["seller-1"] },
  });
  expect(mocks.partitionSellers).toHaveBeenCalledTimes(2);
  expect(mocks.markKeyword).not.toHaveBeenCalled();
  expect(
    scanCatchError({ error: new ScanIncompleteError("in-flight") })
  ).toEqual({ retryDelayInMs: PERSONA_RETRY_MS });
});
it("can complete when a previously busy seller becomes fresh during sibling work", async () => {
  mocks.inFlight.mockResolvedValue(new Set(["seller-1"]));
  mocks.partitionSellers
    .mockResolvedValueOnce({ fresh: [], stale: ["seller-1"] })
    .mockResolvedValueOnce({ fresh: [{ reference: "seller-1" }], stale: [] });
  await expect(run("keyword")).resolves.toMatchObject({
    status: "completed",
    sellersLaunched: 0,
  });
  expect(mocks.markKeyword).toHaveBeenCalledTimes(1);
});
it("does not mark the keyword fresh when an invisible older seller causes a duplicate child to defer and then fails", async () => {
  mocks.older.mockImplementation(
    async (_entity, _reference, _marketplace, self: { id: string }) =>
      self.id === "run_duplicate" ? "run_older" : null
  );
  mocks.sellers.mockImplementation(async () => {
    try {
      await run("seller", {}, "run_duplicate");
      return { runs: [{ ok: true }] };
    } catch (error) {
      expect(error).toMatchObject({
        reason: "in-flight",
        details: { olderRunId: "run_older" },
      });
      return {
        runs: [
          {
            ok: false,
            error: {
              name: "ScanIncompleteError",
              message: "Scan incomplete: in-flight",
            },
          },
        ],
      };
    }
  });
  await expect(run("keyword")).rejects.toMatchObject({ reason: "in-flight" });
  mocks.client.getSeller.mockRejectedValue(
    new ScanRequestError({
      endpoint: "ebay.get-seller",
      status: 500,
      message: "older failed",
    })
  );
  await expect(run("seller", {}, "run_older")).rejects.toMatchObject({
    name: "PersonaScanError",
  });
  expect(mocks.markKeyword).not.toHaveBeenCalled();
  expect(mocks.db.update).not.toHaveBeenCalled();
  mocks.older.mockResolvedValue(null);
  mocks.sellers.mockResolvedValue({ runs: [{ ok: true }] });
  await expect(run("keyword")).resolves.toMatchObject({ status: "completed" });
});
it("registers manual keyword input before lookup and throws instead of losing it", async () => {
  mocks.inFlight.mockRejectedValueOnce(new Error("lookup unavailable"));
  await expect(
    run("keywords", { keywords: ["ad hoc", "ad hoc"] })
  ).rejects.toThrow("lookup unavailable");
  expect(mocks.register).toHaveBeenCalledWith("ebay", ["ad hoc"]);
  expect(mocks.register.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.inFlight.mock.invocationCallOrder[0] ?? 0
  );
  expect(mocks.keywords).not.toHaveBeenCalled();
  await expect(
    run("keywords", { keywords: ["ad hoc"] })
  ).resolves.toMatchObject({ triggered: 1 });
});
it("registers singular manual input even if persona setup fails", async () => {
  mocks.load.mockRejectedValue(new Error("no profile"));
  await expect(run("keyword")).rejects.toThrow("no profile");
  expect(mocks.register).toHaveBeenCalledWith("ebay", ["camera"]);
});
it("chunks more than 1000 keyword launches and removes duplicate/in-flight inputs", async () => {
  const keywords = Array.from({ length: 1002 }, (_, i) => `keyword-${i}`);
  mocks.inFlight.mockResolvedValue(new Set(["keyword-0"]));
  await expect(
    run("keywords", { keywords: [...keywords, keywords[1]] })
  ).resolves.toMatchObject({ triggered: 1001, skippedInFlight: 1 });
  expect(mocks.keywords.mock.calls.map(([items]) => items.length)).toEqual([
    1000, 1,
  ]);
});
it("skips fresh sellers before persona loading", async () => {
  mocks.partitionSellers.mockResolvedValue({
    fresh: [{ reference: "seller-1" }],
    stale: [],
  });
  await expect(run("seller")).resolves.toMatchObject({
    status: "skipped",
    reason: "fresh",
  });
  expect(mocks.load).not.toHaveBeenCalled();
});
it("completes empty/fresh catalogs without a child batch", async () => {
  await expect(run("seller")).resolves.toMatchObject({
    status: "completed",
    listingBatches: 0,
  });
  expect(mocks.listings).not.toHaveBeenCalled();
  expect(mocks.db.update).toHaveBeenCalledTimes(1);
});
it("finishes discovered listing work after partial catalog failure and leaves the seller stale", async () => {
  mocks.client.getSellerListings
    .mockResolvedValueOnce({ listings: [{ listingId }], hasMore: true })
    .mockRejectedValueOnce(new Error("page failed"));
  mocks.partitionListings.mockResolvedValue({
    verdicts: [],
    stale: [listingId],
  });
  await expect(run("seller")).rejects.toMatchObject({
    reason: "request-failed",
  });
  expect(mocks.listings).toHaveBeenCalledTimes(1);
  expect(mocks.db.update).not.toHaveBeenCalled();
});
it("requires successful listing children before completing the seller", async () => {
  mocks.partitionListings.mockResolvedValue({
    verdicts: [],
    stale: [listingId],
  });
  mocks.listings.mockResolvedValue({ runs: [{ ok: false }] });
  await expect(run("seller")).rejects.toMatchObject({
    reason: "catalog-incomplete",
  });
  expect(mocks.db.update).not.toHaveBeenCalled();
});
it("marks only a typed seller-detail 404 as seller-gone", async () => {
  mocks.client.getSeller.mockRejectedValue(
    new ScanRequestError({
      endpoint: "ebay.get-seller",
      status: 404,
      message: "gone",
    })
  );
  await expect(run("seller")).resolves.toMatchObject({ reason: "seller-gone" });
  expect(mocks.upsertSeller).toHaveBeenCalled();
  expect(mocks.db.update).toHaveBeenCalledTimes(1);
  expect(mocks.client.getSellerListings).not.toHaveBeenCalled();
});
it("keeps the parent retry policy and parent-only force semantics", async () => {
  expect(
    mocks.definitions.get("scan-listings-by-keyword")?.retry.maxAttempts
  ).toBe(3);
  expect(
    mocks.definitions.get("scan-listings-by-seller")?.retry.maxAttempts
  ).toBe(3);
  await run("seller", { forceRefresh: true });
  expect(mocks.partitionSellers).not.toHaveBeenCalled();
  expect(mocks.partitionListings).toHaveBeenCalled();
});

it("finishes usable keyword search results before throwing a later page's persona failure", async () => {
  mocks.client.searchListings
    .mockResolvedValueOnce({ listings: [{ listingId }], hasMore: true })
    .mockRejectedValueOnce(
      new ScanRequestError({
        endpoint: "ebay.search-listings",
        status: 429,
        message: "throttled",
      })
    );
  mocks.partitionListings.mockResolvedValue({
    verdicts: [],
    stale: [listingId],
  });
  await expect(run("keyword")).rejects.toMatchObject({
    name: "PersonaScanError",
  });
  expect(mocks.listings).toHaveBeenCalledTimes(1);
  expect(mocks.sellers).toHaveBeenCalledTimes(1);
  expect(mocks.manager.markSoftFailure).toHaveBeenCalledTimes(1);
  expect(mocks.markKeyword).not.toHaveBeenCalled();
});
it("leaves the seller stale when the catalog safety ceiling is reached", async () => {
  mocks.client.getSellerListings.mockResolvedValue({
    listings: [{ listingId }],
    hasMore: true,
  });
  await expect(run("seller")).rejects.toMatchObject({
    reason: "catalog-incomplete",
    details: { catalogComplete: false },
  });
  expect(mocks.client.getSellerListings).toHaveBeenCalledTimes(1000);
  expect(mocks.db.update).not.toHaveBeenCalled();
});
it("splits waiting listing batches into API waves of at most 1000 and checks every wave", async () => {
  const ids = Array.from({ length: 1001 }, (_, i) => `${123_456_789_012 + i}`);
  mocks.partitionListings.mockResolvedValue({ verdicts: [], stale: ids });
  mocks.listings.mockImplementation(async (items: unknown[]) => ({
    runs: items.map(() => ({ ok: true, output: { verdicts: [] } })),
  }));
  await expect(run("seller")).resolves.toMatchObject({ listingBatches: 1001 });
  expect(mocks.listings.mock.calls.map(([items]) => items.length)).toEqual([
    1000, 1,
  ]);
  expect(mocks.db.update).toHaveBeenCalledTimes(1);
});
it("awaits more than 1000 seller dependencies in bounded waves", async () => {
  const verdicts = Array.from({ length: 1001 }, (_, i) => ({
    ...verdict,
    sellerReference: `seller-${i}`,
  }));
  mocks.partitionListings.mockResolvedValue({ verdicts, stale: [] });
  mocks.sellers.mockImplementation(async (items: unknown[]) => ({
    runs: items.map(() => ({ ok: true, output: { status: "completed" } })),
  }));
  await expect(run("keyword")).resolves.toMatchObject({
    sellersLaunched: 1001,
  });
  expect(mocks.sellers.mock.calls.map(([items]) => items.length)).toEqual([
    1000, 1,
  ]);
});
it("keeps bulk dispatch errors retryable and sends no empty batches", async () => {
  mocks.keywords.mockRejectedValueOnce(new Error("dispatch failed"));
  await expect(run("keywords")).rejects.toThrow("dispatch failed");
  expect(mocks.register).toHaveBeenCalledWith("ebay", ["camera"]);
  mocks.keywords.mockClear();
  mocks.inFlight.mockResolvedValue(new Set(["camera"]));
  await expect(run("keywords")).resolves.toMatchObject({
    triggered: 0,
    skippedInFlight: 1,
  });
  expect(mocks.keywords).not.toHaveBeenCalled();
});
