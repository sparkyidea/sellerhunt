import { ScanRequestError } from "@dashseller/marketplace-scan/errors";
import { expect, it, vi } from "vitest";
import {
  isInFlightFailure,
  ListingBatchError,
  PERSONA_RETRY_MS,
  PersonaScanError,
  PersonaUnavailableError,
  routeScanFailure,
  ScanIncompleteError,
  scanCatchError,
} from "../scan-errors";

it("delays persona and sole in-flight blockers 20 minutes and leaves other backoff unchanged", () => {
  for (const error of [
    new PersonaScanError("failed", false),
    new PersonaUnavailableError("cooling", { app: "ebay", label: "box" }),
    new ScanIncompleteError("in-flight"),
  ]) {
    expect(scanCatchError({ error })).toEqual({
      retryDelayInMs: 20 * 60 * 1000,
    });
  }
  for (const error of [
    new ListingBatchError("ebay", []),
    new ScanIncompleteError("children-incomplete"),
    new Error("failure"),
  ]) {
    expect(scanCatchError({ error })).toBeUndefined();
  }
  expect(PERSONA_RETRY_MS).toBeGreaterThan(15 * 60 * 1000);
});
it("retains machine-readable reason and older ID across the SDK name/message boundary", () => {
  const error = new ScanIncompleteError("in-flight", {
    olderRunId: "run_older",
  });
  const serialized = { name: error.name, message: error.message };
  expect(isInFlightFailure(serialized)).toBe(true);
  expect(error.reason).toBe("in-flight");
  expect(JSON.parse(serialized.message.split("\n")[1] ?? "null")).toEqual({
    olderRunId: "run_older",
  });
  expect(
    isInFlightFailure(new ScanIncompleteError("children-incomplete"))
  ).toBe(false);
  expect(
    isInFlightFailure({ name: "Error", message: "Scan incomplete: in-flight" })
  ).toBe(false);
});
it.each([
  401, 403, 429, 500,
])("routes persona response %i once", async (status) => {
  const manager = { markSoftFailure: vi.fn(), markDataAuthFailure: vi.fn() };
  const error = await routeScanFailure(
    manager,
    new ScanRequestError({
      endpoint: "ebay.get-listing",
      status,
      message: "failure",
    }),
    ["remaining"]
  );
  expect(error).toMatchObject({
    name: "PersonaScanError",
    remaining: ["remaining"],
  });
  expect(manager.markDataAuthFailure).toHaveBeenCalledTimes(
    status < 429 ? 1 : 0
  );
  expect(manager.markSoftFailure).toHaveBeenCalledTimes(status >= 429 ? 1 : 0);
});
