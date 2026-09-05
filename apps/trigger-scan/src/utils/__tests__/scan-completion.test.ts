import { ScanRequestError } from "@dashseller/marketplace-scan/errors";
import { describe, expect, it } from "vitest";
import { isListingBatchComplete, isListingNotFound } from "../scan-completion";

const completed = {
  ok: true as const,
  output: {
    mode: "scanned" as const,
    aborted: false,
    failed: 0,
    notFound: 1,
    verdicts: [
      { listingId: "123", fit: true },
      { listingId: "456", fit: false },
    ],
  },
};

describe("listing completion", () => {
  it("accounts for fitted, threshold-rejected, and missing listings once", () => {
    const requested = ["https://www.ebay.com/itm/123", "456", "789"];
    expect(isListingBatchComplete(completed, requested.length)).toBe(true);
  });

  it.each([
    { name: "unresolved error", changes: { failed: 1, notFound: 0 } },
    { name: "persona abort", changes: { aborted: true } },
    { name: "missing result", changes: { notFound: 0 } },
    { name: "extra result", changes: { notFound: 2 } },
  ])("rejects $name", ({ changes }) => {
    expect(
      isListingBatchComplete(
        { ...completed, output: { ...completed.output, ...changes } },
        3
      )
    ).toBe(false);
  });

  it("rejects crashes, defensive launcher results, and incomplete coverage", () => {
    expect(isListingBatchComplete({ ok: false }, 3)).toBe(false);
    expect(
      isListingBatchComplete({ ok: true, output: { mode: "fanned" } }, 3)
    ).toBe(false);
    expect(isListingBatchComplete(completed, 3, false)).toBe(false);
  });

  it("accepts an empty fully walked catalog", () => {
    const empty = {
      ...completed,
      output: { ...completed.output, verdicts: [], notFound: 0 },
    };
    expect(isListingBatchComplete(empty, 0)).toBe(true);
    expect(isListingBatchComplete(empty, 0, false)).toBe(false);
  });

  it.each([
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid counts: %s", (count) => {
    expect(isListingBatchComplete(completed, count)).toBe(false);
    for (const field of ["failed", "notFound"] as const) {
      expect(
        isListingBatchComplete(
          { ...completed, output: { ...completed.output, [field]: count } },
          3
        )
      ).toBe(false);
    }
  });
});

describe("terminal listing checks", () => {
  it.each([
    ["ebay.get-listing", 404, "ebay", true],
    ["shop.get-listing", 404, "shop", true],
    ["ebay.get-new-token", 404, "ebay", false],
    ["shop.get-listing", 404, "ebay", false],
    ["ebay.get-listing", 429, "ebay", false],
    ["ebay.get-listing", 500, "ebay", false],
  ] as const)("classifies %s / %s for %s", (endpoint, status, marketplace, expected) => {
    const error = new ScanRequestError({
      endpoint,
      status,
      message: "test response",
    });
    expect(isListingNotFound(error, marketplace)).toBe(expected);
  });

  it("leaves parse, unknown, and untyped errors unresolved", () => {
    for (const error of [
      new SyntaxError("invalid response"),
      new Error("unknown"),
      { endpoint: "ebay.get-listing", status: 404 },
      null,
    ]) {
      expect(isListingNotFound(error, "ebay")).toBe(false);
    }
  });
});
