import type { ScanListing } from "./types";

interface PricedVariant {
  currency: string | null;
  price: number | null;
  status?: string | null;
}

/** Removed units never contribute; a range requires all prices in one currency. */
export function variantPriceRange(variants: readonly PricedVariant[]) {
  const current = variants.filter((v) => v.status !== "removed");
  const currency = current[0]?.currency ?? null;
  let priceMin = Number.POSITIVE_INFINITY;
  let priceMax = Number.NEGATIVE_INFINITY;
  for (const v of current) {
    if (v.price === null || !currency || v.currency !== currency) {
      return { priceMin: null, priceMax: null, currency: null };
    }
    priceMin = Math.min(priceMin, v.price);
    priceMax = Math.max(priceMax, v.price);
  }
  return current.length
    ? { priceMin, priceMax, currency }
    : { priceMin: null, priceMax: null, currency: null };
}

/** Adapter completeness must be established before this structural validation. */
export function validateListingObservation(listing: ScanListing): void {
  if (
    !(
      listing.title.trim() &&
      listing.reference &&
      listing.marketplace &&
      listing.variants.length
    )
  ) {
    throw new Error(
      "Listing identity, title and a complete nonempty variant set are required"
    );
  }
  const references = new Set<string>();
  for (const v of listing.variants) {
    if (!v.reference || references.has(v.reference)) {
      throw new Error("Missing or duplicate variant identity");
    }
    references.add(v.reference);
    if (v.reference === "__default__" && listing.variants.length !== 1) {
      throw new Error("A default variant must be the only variant");
    }
    if (v.status !== "in_stock" && v.status !== "out_of_stock") {
      throw new Error("Invalid observed variant status");
    }
    validateMeasurement(v.price);
  }
  validateMeasurement(listing.itemSold);
  validateMeasurement(listing.soldLast24h);
  validateMeasurement(listing.soldLast30Days);
}

function validateMeasurement(value: number | null): void {
  if (
    value !== null &&
    (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647)
  ) {
    throw new Error(
      "Measurements must be nullable nonnegative 32-bit integers"
    );
  }
}
