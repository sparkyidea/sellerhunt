import { beforeEach, expect, it, type Mock, vi } from "vitest";
import "../../workflows/scan/scan-listings-by-ids";
import "../../workflows/scan/scan-listings-by-keyword";
import "../../workflows/scan/scan-listings-by-keywords";
import "../../workflows/scan/scan-listings-by-seller";
import type { ScanConfig } from "../scan-config";

interface TaskDefinition {
  id: string;
  run: (payload: Record<string, unknown>) => Promise<unknown>;
}
interface TaskCalls {
  batchTrigger: Mock;
  batchTriggerAndWait: Mock;
  trigger: Mock;
  triggerAndWait: Mock;
}
const mocks = vi.hoisted(() => ({
  runs: new Map<string, TaskDefinition["run"]>(),
  calls: new Map<string, TaskCalls>(),
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
}));
vi.mock("@dashseller/db", () => ({ db: mocks.db }));
vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: (definition: TaskDefinition) => {
    const calls = {
      trigger: vi.fn(),
      triggerAndWait: vi.fn(),
      batchTrigger: vi.fn(),
      batchTriggerAndWait: vi.fn(),
    };
    mocks.runs.set(definition.id, definition.run);
    mocks.calls.set(definition.id, calls);
    return { id: definition.id, ...calls };
  },
  logger: { info: vi.fn(), warn: vi.fn() },
  metadata: { set: vi.fn().mockReturnThis() },
  tags: { add: vi.fn() },
}));
vi.mock("../machine-metadata", () => ({ setMachineMetadata: vi.fn() }));
vi.mock("../mobile-profile-manager", () => ({
  MobileProfileTokenManager: {
    loadForThisBox: async () => ({
      profileId: "profile",
      createScanClient: async () => mocks.client,
      markUsed: vi.fn(),
    }),
  },
}));
vi.mock("../scan-launch-options", () => ({
  scanLaunchOptions: async () => ({
    idempotencyKey: "global",
    idempotencyKeyTTL: "2h",
  }),
}));
vi.mock("../../nodes/scan/upsert-scan-keyword", () => ({
  markKeywordScanned: vi.fn(),
}));
vi.mock("../../nodes/scan/upsert-scan-seller", () => ({
  upsertScanSeller: vi.fn(),
}));
vi.mock("../../nodes/scan/resolve-keywords-with-llm", () => ({
  resolveKeywordsWithLlm: vi.fn(),
}));

const config: ScanConfig = {
  marketplace: "ebay",
  enabled: true,
  keywordBatchSize: 20,
  sellerBatchSize: 20,
  listingBatchSize: 50,
  listingScanBatchSize: 1,
  listingScanDelayMinMs: 0,
  listingScanDelayMaxMs: 0,
  keywordLlmEnabled: false,
  maxSearchPages: 1,
  minItemSold: 0,
  minPriceCents: 0,
  maxPriceCents: null,
  minSoldLast24h: null,
};
const listingIds = ["123456789012", "123456789013"];

function task(id: string) {
  const run = mocks.runs.get(id);
  const calls = mocks.calls.get(id);
  if (!(run && calls)) {
    throw new Error(`Task not registered: ${id}`);
  }
  return { run, ...calls };
}
function scanned(ids: string[]) {
  return {
    ok: true,
    output: {
      mode: "scanned",
      aborted: false,
      failed: 0,
      notFound: 0,
      verdicts: ids.map((listingId) => ({
        listingId,
        fit: true,
        sellerReference: "seller-1",
      })),
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.limit.mockResolvedValue([]);
  const page = {
    listings: listingIds.map((listingId) => ({ listingId })),
    hasMore: false,
  };
  mocks.client.searchListings.mockResolvedValue(page);
  mocks.client.getSellerListings.mockResolvedValue(page);
  mocks.client.getSeller.mockResolvedValue({ seller: { storeName: "Seller" } });
  task("scan-listings-by-ids").triggerAndWait.mockImplementation(
    async (payload) => scanned(payload.listingIds)
  );
  task("scan-listings-by-ids").batchTriggerAndWait.mockImplementation(
    async (items) => ({
      runs: items.map((item: { payload: { listingIds: string[] } }) =>
        scanned(item.payload.listingIds)
      ),
    })
  );
});

it("keeps every keyword child at priority zero across bulk API chunks", async () => {
  const keywords = Array.from({ length: 1001 }, (_, i) => `keyword-${i}`);
  await task("scan-listings-by-keywords").run({
    marketplace: "ebay",
    keywords,
    config,
  });
  const batches = task("scan-listings-by-keyword").batchTrigger.mock.calls;
  expect(batches).toHaveLength(2);
  const items = batches.flatMap(([batch]) => batch);
  expect(items).toHaveLength(keywords.length);
  for (const item of items) {
    expect(item.options).toMatchObject({
      priority: 0,
      idempotencyKey: "global",
      idempotencyKeyTTL: "2h",
    });
  }
});

it("prioritizes awaited keyword listings and promotes their seller at seller priority", async () => {
  const result = await task("scan-listings-by-keyword").run({
    marketplace: "ebay",
    keyword: "camera",
    config,
  });
  expect(result).toMatchObject({ status: "completed", sellersFired: 1 });
  const listingTask = task("scan-listings-by-ids");
  expect(listingTask.triggerAndWait).toHaveBeenCalledTimes(2);
  for (const listingId of listingIds) {
    expect(listingTask.triggerAndWait).toHaveBeenCalledWith(
      { marketplace: "ebay", listingIds: [listingId], config },
      { priority: 3600 }
    );
  }
  expect(task("scan-listings-by-seller").trigger).toHaveBeenCalledWith(
    { marketplace: "ebay", sellerId: "seller-1", config },
    expect.objectContaining({
      priority: 1800,
      idempotencyKey: "global",
      idempotencyKeyTTL: "2h",
    })
  );
});

it("prioritizes every awaited seller catalog batch", async () => {
  const result = await task("scan-listings-by-seller").run({
    marketplace: "ebay",
    sellerId: "seller-1",
    config,
  });
  expect(result).toMatchObject({
    status: "completed",
    listingBatchesSucceeded: 2,
  });
  const batches = task("scan-listings-by-ids").batchTriggerAndWait.mock.calls;
  expect(batches).toHaveLength(1);
  expect(batches[0]?.[0]).toEqual(
    listingIds.map((listingId) => ({
      payload: { marketplace: "ebay", listingIds: [listingId], config },
      options: {
        priority: 3600,
        tags: ["scan_seller_seller-1", "marketplace_ebay"],
      },
    }))
  );
});

it("preserves listing priority across self-fanout API chunks", async () => {
  const ids = Array.from({ length: 1001 }, (_, i) =>
    String(123_456_789_012 + i)
  );
  const result = await task("scan-listings-by-ids").run({
    marketplace: "ebay",
    listingIds: ids,
    config,
  });
  expect(result).toMatchObject({ mode: "fanned", triggered: ids.length });
  const batches = task("scan-listings-by-ids").batchTrigger.mock.calls;
  expect(batches).toHaveLength(2);
  const items = batches.flatMap(([batch]) => batch);
  expect(items).toHaveLength(ids.length);
  for (const item of items) {
    expect(item.options).toMatchObject({ priority: 3600 });
  }
});
