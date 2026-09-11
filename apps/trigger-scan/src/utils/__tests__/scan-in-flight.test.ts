import { beforeEach, expect, it, vi } from "vitest";
import {
  inFlight,
  listingSweepInFlight,
  NON_TERMINAL,
  olderSiblingRunning,
} from "../scan-in-flight";
import { entityTag, launchTags, SOURCE_CRON_TAG } from "../scan-tags";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@trigger.dev/sdk", () => ({
  runs: { list: mocks.list },
  logger: { warn: vi.fn() },
}));
const self = { id: "run_m", createdAt: new Date("2026-01-01") };
function row(id: string, tags: string[], createdAt = self.createdAt) {
  return { id, createdAt, tags };
}
function pages(...batches: ReturnType<typeof row>[][]) {
  return (async function* () {
    for (const batch of batches) {
      for (const run of batch) {
        yield await Promise.resolve(run);
      }
    }
  })();
}
beforeEach(() => vi.resetAllMocks());
it("consumes all pages and checks marketplace tags on every result", async () => {
  mocks.list.mockReturnValue(
    pages(
      [
        row("first", launchTags("shop", "seller", "wrong")),
        row("second", launchTags("ebay", "seller", "seller-1")),
      ],
      [row("third", launchTags("ebay", "seller", "seller-2"))]
    )
  );
  expect(await inFlight("seller", "ebay")).toEqual(
    new Set(["seller-1", "seller-2"])
  );
  expect(mocks.list).toHaveBeenCalledWith(
    expect.objectContaining({
      taskIdentifier: "scan-listings-by-seller",
      status: [...NON_TERMINAL],
      tag: "marketplace_ebay",
    })
  );
  expect(NON_TERMINAL).toContain("WAITING");
  expect(NON_TERMINAL).not.toContain("COMPLETED");
});
it("orders older siblings deterministically and excludes self, newer runs, and other markets", async () => {
  mocks.list.mockReturnValue(
    pages(
      [
        row("run_m", launchTags("ebay", "keyword", "camera")),
        row("run_z", launchTags("ebay", "keyword", "camera")),
        row("run_a", launchTags("ebay", "keyword", "camera")),
        row(
          "run_0",
          launchTags("shop", "keyword", "camera"),
          new Date("2020-01-01")
        ),
      ],
      [
        row(
          "run_oldest",
          launchTags("ebay", "keyword", "camera"),
          new Date("2025-01-01")
        ),
      ]
    )
  );
  expect(await olderSiblingRunning("keyword", "camera", "ebay", self)).toBe(
    "run_oldest"
  );
});
it("does not classify self or a newer equal-time sibling as older", async () => {
  mocks.list.mockReturnValue(
    pages([
      row("run_m", launchTags("ebay", "seller", "a")),
      row("run_z", launchTags("ebay", "seller", "a")),
    ])
  );
  expect(await olderSiblingRunning("seller", "a", "ebay", self)).toBeNull();
});
it("leaves prelaunch failures visible while startup lookup failure performs the scan", async () => {
  mocks.list.mockImplementation(() => {
    throw new Error("unavailable");
  });
  await expect(inFlight("keyword", "ebay")).rejects.toThrow("unavailable");
  expect(
    await olderSiblingRunning("keyword", "camera", "ebay", self)
  ).toBeNull();
});
it("checks both cron and marketplace tags across listing lookup pages", async () => {
  mocks.list.mockReturnValue(
    pages(
      [
        row("other-market", [SOURCE_CRON_TAG, "marketplace_shop"]),
        row("manual", ["marketplace_ebay"]),
      ],
      [row("cron", [SOURCE_CRON_TAG, "marketplace_ebay"])]
    )
  );
  expect(await listingSweepInFlight("ebay")).toBe(true);
});
it("does not truncate long entity references into colliding tags", async () => {
  const reference = "a".repeat(129);
  expect(entityTag("keyword", reference)).toBeNull();
  expect(launchTags("ebay", "keyword", reference)).toEqual([
    "marketplace_ebay",
  ]);
  expect(
    await olderSiblingRunning("keyword", reference, "ebay", self)
  ).toBeNull();
  expect(mocks.list).not.toHaveBeenCalled();
});
