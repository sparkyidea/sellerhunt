import { ScanRequestError } from "@dashseller/marketplace-scan/errors";
import { expect, it } from "vitest";
import { isListingNotFound, isSellerNotFound } from "../scan-completion";

it.each([
  "ebay",
  "shop",
])("classifies only exact detail 404 endpoints for %s", (marketplace) => {
  const error = (endpoint: string, status = 404) =>
    new ScanRequestError({ endpoint, status, message: "failed" });
  expect(
    isListingNotFound(error(`${marketplace}.get-listing`), marketplace)
  ).toBe(true);
  expect(
    isSellerNotFound(error(`${marketplace}.get-seller`), marketplace)
  ).toBe(true);
  for (const other of [
    new Error("404"),
    error("other.get-listing"),
    error(`${marketplace}.get-listing`, 500),
  ]) {
    expect(isListingNotFound(other, marketplace)).toBe(false);
    expect(isSellerNotFound(other, marketplace)).toBe(false);
  }
  expect(
    isSellerNotFound(error(`${marketplace}.get-seller-listings`), marketplace)
  ).toBe(false);
});
