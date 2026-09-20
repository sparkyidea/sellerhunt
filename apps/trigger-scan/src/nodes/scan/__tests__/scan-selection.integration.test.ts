import { createDbClient } from "@dashseller/db/client";
import { scanKeyword, scanListing, scanSeller } from "@dashseller/db/schema";
import { migrateTestDb, TEST_DATABASE_URL } from "@dashseller/db/testing";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { dbKeywordStore } from "../keyword-store";
import { pickStale } from "../scan-dispatch";
import { registerScanKeywords } from "../upsert-scan-keyword";

const connection = createDbClient(TEST_DATABASE_URL);
const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  lookup: vi.fn(),
  launch: vi.fn(),
  definitions: new Map<
    string,
    {
      run: (payload: {
        marketplace: string;
        keywords: string[];
      }) => Promise<unknown>;
    }
  >(),
}));
vi.mock("../../../utils/db", () => ({
  get db() {
    return mocks.getDb();
  },
}));
vi.mock("@trigger.dev/sdk", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
  schemaTask: (definition: {
    id: string;
    run: (payload: {
      marketplace: string;
      keywords: string[];
    }) => Promise<unknown>;
  }) => {
    mocks.definitions.set(definition.id, definition);
    return definition;
  },
}));
vi.mock("../../../keywords/openai-client", () => ({
  createOpenAIClient: vi.fn(),
}));
vi.mock("../../../utils/scan-in-flight", () => ({ inFlight: mocks.lookup }));
vi.mock("../../../workflows/scan/scan-listings-by-keyword", () => ({
  scanListingsByKeyword: { batchTrigger: mocks.launch },
}));
import "../../../workflows/scan/scan-listings-by-keywords";

beforeAll(() => migrateTestDb());
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.getDb.mockReturnValue(connection.db);
  await connection.db.delete(scanListing);
  await connection.db.delete(scanKeyword);
  await connection.db.delete(scanSeller);
});
afterAll(() => connection.close());
const old = new Date("2020-01-01");

it("selects stale listings by lastScannedAt, ordered oldest first and scoped to marketplace", async () => {
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
  await connection.db.insert(scanListing).values([
    {
      id: "old",
      marketplace: "ebay",
      reference: "old",
      title: "Old scan",
      lastScannedAt: old,
    },
    {
      id: "boundary",
      marketplace: "ebay",
      reference: "boundary",
      title: "At cutoff",
      lastScannedAt: cutoff,
    },
    {
      id: "fresh",
      marketplace: "ebay",
      reference: "fresh",
      title: "Fresh scan",
      lastScannedAt: new Date(),
    },
    {
      id: "other",
      marketplace: "shop",
      reference: "other",
      title: "Other marketplace",
      lastScannedAt: old,
    },
  ]);
  expect(await pickStale("listing", "ebay", 10)).toEqual(["old", "boundary"]);
  expect(await pickStale("listing", "ebay", 1)).toEqual(["old"]);
  expect(await pickStale("listing", "ebay", 0)).toEqual([]);
});

it("keyword extraction writes only the pool and never refreshes listings", async () => {
  await connection.db.insert(scanListing).values({
    marketplace: "ebay",
    reference: "old",
    title: "Camera",
    lastScannedAt: old,
  });
  await connection.db.insert(scanKeyword).values({
    id: "manual",
    marketplace: "ebay",
    keyword: "camera",
    source: "manual",
    firstSeenAt: old,
    lastSeenAt: old,
    lastScannedAt: old,
    deadAt: old,
  });
  const before = await connection.db.select().from(scanListing);
  await dbKeywordStore.saveKeyword({ marketplace: "ebay", keyword: "camera" });
  await dbKeywordStore.saveKeyword({ marketplace: "shop", keyword: "camera" });
  expect(await connection.db.select().from(scanListing)).toEqual(before);
  expect(await pickStale("listing", "ebay", 10)).toEqual(["old"]);
  const keywords = await connection.db.select().from(scanKeyword);
  expect(keywords).toHaveLength(2);
  expect(keywords.find((row) => row.id === "manual")).toMatchObject({
    source: "manual",
    firstSeenAt: old,
    lastScannedAt: old,
    deadAt: old,
  });
  expect(keywords.find((row) => row.marketplace === "shop")).toMatchObject({
    source: "llm",
    lastScannedAt: null,
    deadAt: null,
  });
});

it("keeps seller freshness based on lastScannedAt", async () => {
  await connection.db.insert(scanSeller).values([
    {
      marketplace: "ebay",
      reference: "stale",
      lastScannedAt: old,
      updatedAt: new Date(),
    },
    {
      marketplace: "ebay",
      reference: "fresh",
      lastScannedAt: new Date(),
      updatedAt: old,
    },
  ]);
  expect(await pickStale("seller", "ebay", 10)).toEqual(["stale"]);
});

it("preserves existing keyword source, timestamps, retirement, and marketplace identity", async () => {
  await connection.db.insert(scanKeyword).values({
    id: "existing",
    marketplace: "ebay",
    keyword: "camera",
    source: "llm",
    firstSeenAt: old,
    lastSeenAt: old,
    lastScannedAt: old,
    deadAt: old,
  });
  const before = await connection.db.select().from(scanKeyword);
  await registerScanKeywords("ebay", ["camera", "camera"]);
  expect(await connection.db.select().from(scanKeyword)).toEqual(before);
  await registerScanKeywords("shop", ["camera"]);
  expect(
    (await connection.db.select().from(scanKeyword)).find(
      (row) => row.marketplace === "shop"
    )
  ).toMatchObject({ source: "manual", lastScannedAt: null, deadAt: null });
});
it("persists ad hoc intake through lookup failures, exhausted retries, and eventual dispatch", async () => {
  const launcher = mocks.definitions.get("scan-listings-by-keywords");
  if (!launcher) {
    throw new Error("Missing launcher");
  }
  mocks.lookup.mockRejectedValue(new Error("lookup unavailable"));
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(
      launcher.run({ marketplace: "ebay", keywords: ["ad hoc"] })
    ).rejects.toThrow("lookup unavailable");
  }
  expect(mocks.launch).not.toHaveBeenCalled();
  expect(await pickStale("keyword", "ebay", 2)).toEqual(["ad hoc"]);
  expect(await connection.db.select().from(scanKeyword)).toEqual([
    expect.objectContaining({
      keyword: "ad hoc",
      source: "manual",
      lastScannedAt: null,
    }),
  ]);
  mocks.lookup.mockResolvedValue(new Set());
  await expect(
    launcher.run({ marketplace: "ebay", keywords: ["ad hoc"] })
  ).resolves.toMatchObject({ triggered: 1 });
  expect(mocks.launch).toHaveBeenCalledTimes(1);
});
