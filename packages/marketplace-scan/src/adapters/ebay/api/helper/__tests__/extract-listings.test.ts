/**
 * Regression net for `extractListings` reading BOTH `modules` and
 * `deferred_modules`. eBay serves search results with `enableDeferredModules=1`,
 * which splits the river: the first cards land in `modules`, the rest in
 * `deferred_modules`. A prior version read only `modules` and silently dropped
 * ~85% of every page (8 of 53 cards in a real `drone` capture).
 *
 * Fixtures are SYNTHETIC minimal ITEM modules — `extractListings` only reads
 * `listingId` plus optional-chained display fields, all of which tolerate
 * `undefined` — so a one-shot cast to the (deeply generated, sample-derived)
 * raw type is the pragmatic way to build them.
 */
import { describe, expect, it } from "vitest";
import type { EbaySearchResponse } from "../../../raw-types/search-response";
import { extractListings } from "../search";

function moduleMap(ids: string[]): Record<string, unknown> {
  return Object.fromEntries(
    ids.map((id, i) => [`listing${i}`, { _type: "ITEM", listingId: id }])
  );
}

function makeResponse(
  modules: string[],
  deferred: string[][]
): EbaySearchResponse {
  return {
    modules: moduleMap(modules),
    deferred_modules: deferred.map(moduleMap),
  } as unknown as EbaySearchResponse;
}

const ids = (raw: EbaySearchResponse) =>
  extractListings(raw).map((l) => l.listingId);

describe("extractListings", () => {
  it("walks both modules and deferred_modules", () => {
    const raw = makeResponse(["1", "2"], [["3", "4", "5"]]);
    expect(ids(raw)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("recovers listings that live ONLY in deferred_modules", () => {
    // The exact shape of the old bug: synchronous river empty, river deferred.
    const raw = makeResponse([], [["10", "11"]]);
    expect(ids(raw)).toEqual(["10", "11"]);
  });

  it("dedupes a listing that appears in both groups", () => {
    const raw = makeResponse(["1", "2"], [["2", "3"]]);
    expect(ids(raw)).toEqual(["1", "2", "3"]);
  });

  it("handles a response with no deferred_modules", () => {
    const raw = makeResponse(["1"], []);
    expect(ids(raw)).toEqual(["1"]);
  });
});
