import { ScanRequestError } from "@dashseller/marketplace-scan/errors";

/** A negative detail response completes this check, without retiring the listing. */
export function isListingNotFound(
  error: unknown,
  marketplace: string
): boolean {
  return (
    error instanceof ScanRequestError &&
    error.status === 404 &&
    error.endpoint === `${marketplace}.get-listing`
  );
}

export function isSellerNotFound(error: unknown, marketplace: string): boolean {
  return (
    error instanceof ScanRequestError &&
    error.status === 404 &&
    error.endpoint === `${marketplace}.get-seller`
  );
}
