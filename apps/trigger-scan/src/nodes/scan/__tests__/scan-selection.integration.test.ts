import { createDbClient } from "@dashseller/db/client";
import { scanKeyword, scanListing, scanSeller } from "@dashseller/db/schema";
import { migrateTestDb, TEST_DATABASE_URL } from "@dashseller/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { MAX_LLM_ATTEMPTS } from "../../../keywords/llm-stage";
import {
  loadUnresolvedListings,
  pickUnresolvedListings,
  resolveKeywordsWithLlm,
} from "../resolve-keywords-with-llm";
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
vi.mock("@dashseller/db", () => ({
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
async function listing(
  id: string,
  fields: Partial<typeof scanListing.$inferInsert> = {}
) {
  await connection.db.insert(scanListing).values({
    id,
    reference: id,
    marketplace: "ebay",
    title: id,
    lastScannedAt: old,
    ...fields,
  });
}

it("filters both LLM pickers before limiting, and rejected rows never reach the parser or spend attempts", async () => {
  await registerScanKeywords("ebay", ["resolved"]);
  const [keyword] = await connection.db.select().from(scanKeyword);
  await listing("a-rejected", { qualified: false });
  await listing("b-resolved", { keywordId: keyword?.id });
  await listing("c-exhausted", { keywordAttempts: MAX_LLM_ATTEMPTS });
  await listing("d-other-market", { marketplace: "shop" });
  await listing("e-eligible");
  await listing("f-eligible", { keywordAttempts: 1 });
  const ids = [
    "a-rejected",
    "b-resolved",
    "c-exhausted",
    "d-other-market",
    "e-eligible",
    "f-eligible",
  ];
  expect(
    (await loadUnresolvedListings("ebay", ids)).map((row) => row.id).sort()
  ).toEqual(["e-eligible", "f-eligible"]);
  const selected = await pickUnresolvedListings("ebay", 1);
  expect(selected.map((row) => row.id)).toEqual(["e-eligible"]);
  const parse = vi.fn().mockResolvedValue({
    output_parsed: { items: [{ index: 0, searchPhrase: "" }] },
    status: "completed",
  });
  await resolveKeywordsWithLlm(
    "ebay",
    { keywordLlmEnabled: true },
    selected,
    parse
  );
  expect(parse).toHaveBeenCalledTimes(1);
  expect(parse.mock.calls[0]?.[0].input).toContain("e-eligible");
  expect(parse.mock.calls[0]?.[0].input).not.toContain("a-rejected");
  const rows = await connection.db.select().from(scanListing);
  expect(rows.find((row) => row.id === "a-rejected")).toMatchObject({
    keywordId: null,
    keywordAttempts: 0,
  });
  expect(rows.find((row) => row.id === "e-eligible")?.keywordAttempts).toBe(1);
  expect(await connection.db.select().from(scanKeyword)).toHaveLength(1);
  await connection.db
    .update(scanListing)
    .set({ qualified: true })
    .where(eq(scanListing.id, "a-rejected"));
  const promoted = await pickUnresolvedListings("ebay", 1);
  expect(promoted.map((row) => row.id)).toEqual(["a-rejected"]);
  expect(await loadUnresolvedListings("ebay", ["a-rejected"])).toHaveLength(1);
  parse.mockResolvedValue({
    output_parsed: { items: [{ index: 0, searchPhrase: "promoted phrase" }] },
    status: "completed",
  });
  await resolveKeywordsWithLlm(
    "ebay",
    { keywordLlmEnabled: true },
    promoted,
    parse
  );
  const [promotedRow] = await connection.db
    .select()
    .from(scanListing)
    .where(eq(scanListing.id, "a-rejected"));
  expect(promotedRow?.keywordId).not.toBeNull();
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
  expect(await pickStale("keyword", "ebay", 2, new Set())).toEqual(["ad hoc"]);
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
it("excludes running sellers before LIMIT and caps first scans while retaining stable refresh order", async () => {
  for (const id of ["a-busy", "b-busy", "c-first", "d-first", "e-first"]) {
    await connection.db
      .insert(scanSeller)
      .values({ id, marketplace: "ebay", reference: id });
  }
  for (const id of ["f-old", "g-old", "h-old"]) {
    await connection.db
      .insert(scanSeller)
      .values({ id, marketplace: "ebay", reference: id, lastScannedAt: old });
  }
  await connection.db
    .insert(scanSeller)
    .values({ marketplace: "shop", reference: "other" });
  const exclude = new Set(["a-busy", "b-busy"]);
  expect(await pickStale("seller", "ebay", 3, exclude)).toEqual([
    "c-first",
    "d-first",
    "f-old",
  ]);
  expect(await pickStale("seller", "ebay", 3, exclude)).toEqual([
    "c-first",
    "d-first",
    "f-old",
  ]);
  await expect(pickStale("seller", "ebay", 0, exclude)).rejects.toThrow(
    "at least 2"
  );
});
it("filters unqualified listings, fresh rows, retired keywords, and other marketplaces before selection", async () => {
  await listing("a-rejected", { qualified: false });
  await listing("b-fresh", { lastScannedAt: new Date() });
  await listing("c-shop", { marketplace: "shop" });
  await listing("d-eligible");
  expect(await pickStale("listing", "ebay", 2, new Set())).toEqual([
    "d-eligible",
  ]);
  await connection.db.insert(scanKeyword).values([
    {
      id: "a",
      marketplace: "ebay",
      keyword: "retired",
      source: "manual",
      deadAt: old,
    },
    { id: "b", marketplace: "ebay", keyword: "busy", source: "manual" },
    { id: "c", marketplace: "ebay", keyword: "ready", source: "manual" },
  ]);
  expect(await pickStale("keyword", "ebay", 2, new Set(["busy"]))).toEqual([
    "ready",
  ]);
});

it.each([
  "listing",
  "seller",
  "keyword",
] as const)("rejects a one-item %s cron batch before querying", async (entity) => {
  const select = vi.spyOn(connection.db, "select");
  try {
    await expect(pickStale(entity, "ebay", 1, new Set())).rejects.toThrow(
      "at least 2"
    );
    expect(select).not.toHaveBeenCalled();
  } finally {
    select.mockRestore();
  }
});

it.each([
  "seller",
  "keyword",
] as const)("selects %s first scans and refreshes with more than 33,000 exclusions", async (entity) => {
  const busyFirst = 'a-busy,"quoted"\\{value}';
  const busyRefresh = "e-busy-refresh";
  const references = [
    busyFirst,
    "b-first",
    "c-first",
    "d-first",
    busyRefresh,
    "f-refresh",
  ];
  const rows = references.map((reference, index) => ({
    id: reference,
    marketplace: "ebay",
    reference,
    lastScannedAt: index < 4 ? null : old,
  }));
  if (entity === "seller") {
    await connection.db.insert(scanSeller).values(rows);
  } else {
    await connection.db.insert(scanKeyword).values(
      rows.map(({ reference, ...row }) => ({
        ...row,
        keyword: reference,
        source: "manual" as const,
      }))
    );
  }
  const exclude = new Set(
    Array.from({ length: 33_000 }, (_, index) => `busy-${index}`)
  );
  exclude.add(busyFirst);
  exclude.add(busyRefresh);

  expect(await pickStale(entity, "ebay", 3, exclude)).toEqual([
    "b-first",
    "c-first",
    "f-refresh",
  ]);
  expect(await pickStale(entity, "ebay", 2, exclude)).toEqual([
    "b-first",
    "f-refresh",
  ]);
});
