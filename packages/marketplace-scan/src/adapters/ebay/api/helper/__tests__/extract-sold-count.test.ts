/**
 * Regression net for `extractItemSold`. The sold count is read from
 * `listingProperties[].TOTAL_SOLD_QUANTITY` (present on every listing sampled —
 * ~42, single-item and multi-variant; emits `0` for unsold), falling back to
 * `userToListingRelationshipSummary…numberOfItemsSold`. The `QTY_SOLD_TOTAL_SIGNAL`
 * hotness signal is deliberately NOT a source — it's present on <30% of listings,
 * and reading it first/only dropped the count for the majority (the bug this
 * replaced). `extractSignalCount` lives on for the watcher count in `get-listing.ts`.
 *
 * `extractItemSold` reads only a couple of fields off the (huge, sample-derived)
 * VLS `Listing` type, so synthetic partials cast through `unknown` are the
 * pragmatic fixture — mirrors `extract-listings.test.ts` in this directory.
 */
import { describe, expect, it } from "vitest";
import type { HotnessSignal } from "../../../raw-types/listing-detail-response";
import { extractItemSold, extractSignalCount } from "../extract-sold-count";

function vls(partial: Record<string, unknown>) {
  return partial as unknown as Parameters<typeof extractItemSold>[0];
}

function countSignal(name: string, count: number): HotnessSignal {
  return {
    signal: name,
    signalId: 1,
    signalCategory: "POPULARITY",
    hotnessRank: 1,
    displayLevel: "NORMAL",
    signalGroup: "ON_PAGE",
    properties: [
      { propertyName: "count", propertyValues: [{ intValue: count }] },
    ],
  };
}

const withListingProperty = (sold: number) =>
  vls({
    listingProperties: [
      { propertyName: "DEEP_SKU", propertyValues: [{ booleanValue: false }] },
      {
        propertyName: "TOTAL_SOLD_QUANTITY",
        propertyValues: [{ intValue: sold }],
      },
    ],
  });

const withUserRelationshipSold = (sold: number) =>
  vls({
    userToListingRelationshipSummary: {
      userToListingStatusMessages: {
        propertyDetails: { numberOfItemsSold: { intValue: sold } },
      },
    },
  });

describe("extractItemSold", () => {
  it("reads listingProperties TOTAL_SOLD_QUANTITY", () => {
    expect(extractItemSold(withListingProperty(18))).toBe(18);
  });

  it("returns 0 (not null) for a genuinely unsold listing", () => {
    expect(extractItemSold(withListingProperty(0))).toBe(0);
  });

  it("prefers TOTAL_SOLD_QUANTITY over numberOfItemsSold", () => {
    const listing = vls({
      listingProperties: [
        {
          propertyName: "TOTAL_SOLD_QUANTITY",
          propertyValues: [{ intValue: 18 }],
        },
      ],
      userToListingRelationshipSummary: {
        userToListingStatusMessages: {
          propertyDetails: { numberOfItemsSold: { intValue: 99 } },
        },
      },
    });
    expect(extractItemSold(listing)).toBe(18);
  });

  it("falls back to numberOfItemsSold when the property is absent", () => {
    expect(extractItemSold(withUserRelationshipSold(18))).toBe(18);
  });

  it("returns null when neither field carries the count", () => {
    expect(extractItemSold(vls({}))).toBeNull();
    expect(extractItemSold(undefined)).toBeNull();
  });
});

describe("extractSignalCount", () => {
  it("reads the count off a named signal", () => {
    expect(
      extractSignalCount(
        [countSignal("QTY_SOLD_TOTAL_SIGNAL", 18)],
        "QTY_SOLD_TOTAL_SIGNAL"
      )
    ).toBe(18);
  });

  it("returns null for an absent signal", () => {
    expect(extractSignalCount([], "WATCHERS_COUNT_TOTAL_SIGNAL")).toBeNull();
  });

  it("reads longValue when intValue is absent", () => {
    const watchers: HotnessSignal = {
      ...countSignal("WATCHERS_COUNT_TOTAL_SIGNAL", 0),
      properties: [
        { propertyName: "count", propertyValues: [{ longValue: 32 }] },
      ],
    };
    expect(extractSignalCount([watchers], "WATCHERS_COUNT_TOTAL_SIGNAL")).toBe(
      32
    );
  });
});
