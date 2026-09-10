/**
 * Listing verdict shapes and the threshold rule that produces them.
 *
 * Lives apart from `scan-one-listing.ts` so both the fetch path (that file)
 * and the freshness prefilter (`scan-freshness.ts`, which builds verdicts
 * from stored rows without fetching) can share the types and the rule
 * without an import cycle.
 */
import type { ScanListing } from "@dashseller/marketplace-scan/types";
import type { ScanConfig } from "../../utils/scan-config";

interface VerdictBase {
  /** Numeric listing id (already normalized via `extractListingId`). */
  listingId: string;
  /** Seller reference from the listing, if any (used to promote sellers). */
  sellerReference: string | null;
}

/** Cleared the config thresholds and was persisted. */
export interface FitListingVerdict extends VerdictBase {
  categoryPath: string[] | null;
  fit: true;
  /** True when this scan INSERTED the row (first time seen); false on a rescan. */
  isNew: boolean;
  /** The persisted `scan_listing.id`. */
  scanListingId: string;
  title: string;
  variantsDiscovered: number;
}

/** Below thresholds or missing a title; not persisted by this scan. */
export interface UnfitListingVerdict extends VerdictBase {
  fit: false;
}

export type ListingVerdict = FitListingVerdict | UnfitListingVerdict;

/** The narrow `scan_listing` projection a stored verdict is built from. */
export interface StoredListingRow {
  categoryPath: string[] | null;
  id: string;
  itemSold: number | null;
  price: number | null;
  reference: string;
  sellerReference: string | null;
  soldLast24h: number | null;
  soldLast30Days: number | null;
  title: string;
}

/**
 * Verdict for a listing whose stored row is still within its cooldown: no
 * fetch, no persist. Stored metrics are re-evaluated against the CURRENT
 * thresholds. Fitting stored verdicts are always
 * `isNew: false` (the row exists) and `variantsDiscovered: 0` (nothing was
 * fetched), so the leaf never sends it to the LLM.
 */
export function verdictFromStoredListing(
  row: StoredListingRow,
  marketplace: string,
  config: ScanConfig
): ListingVerdict {
  const { reference: listingId, sellerReference } = row;
  if (!row.title || checkListingThresholds(row, marketplace, config)) {
    return { listingId, fit: false, sellerReference };
  }
  return {
    listingId,
    sellerReference,
    fit: true,
    isNew: false,
    scanListingId: row.id,
    title: row.title,
    categoryPath: row.categoryPath,
    variantsDiscovered: 0,
  };
}

/**
 * Apply min-thresholds. Marketplace-aware because shop.app surfaces a 30-day
 * window where eBay surfaces lifetime + 24h — the absolute thresholds in
 * `scan_config.minItemSold` applies to lifetime sales on eBay and 30-day sales
 * on shop. The 24-hour threshold applies only to eBay.
 */
export function checkListingThresholds(
  listing: Pick<
    ScanListing,
    "price" | "itemSold" | "soldLast24h" | "soldLast30Days"
  >,
  marketplace: string,
  config: ScanConfig
): string | null {
  if (marketplace === "shop") {
    if (
      listing.soldLast30Days === null ||
      listing.soldLast30Days < config.minItemSold
    ) {
      return `soldLast30Days ${listing.soldLast30Days} < ${config.minItemSold}`;
    }
  } else {
    if (listing.itemSold === null || listing.itemSold < config.minItemSold) {
      return `itemSold ${listing.itemSold} < ${config.minItemSold}`;
    }
    if (
      config.minSoldLast24h !== null &&
      (listing.soldLast24h === null ||
        listing.soldLast24h < config.minSoldLast24h)
    ) {
      return `soldLast24h ${listing.soldLast24h} < ${config.minSoldLast24h}`;
    }
  }
  // listing.price is already cents (mapper-converted), matches scan_config thresholds.
  if (listing.price === null || listing.price < config.minPriceCents) {
    return `price ${listing.price} < ${config.minPriceCents}`;
  }
  if (config.maxPriceCents !== null && listing.price > config.maxPriceCents) {
    return `price ${listing.price} > ${config.maxPriceCents}`;
  }
  return null;
}
