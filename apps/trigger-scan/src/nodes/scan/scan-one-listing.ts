/**
 * Per-listing scan core — the unit of listing work, extracted so a single run
 * can scan many listings in a paced loop (see `scan-listings-by-ids`) instead of
 * one container per listing.
 *
 * Takes an **already-created** client + manager: the caller owns persona load
 * (`loadForThisBox`) and bearer mint (`createScanClient`) ONCE per batch, and
 * this node reuses them for each listing. It marks the persona used on a
 * successful fetch (per-request health refresh, same as the old leaf) but does
 * NOT route failures — it rethrows so the batch loop can classify persona-level
 * (429/auth → back off the whole IP) vs per-listing (404/parse → tally + skip).
 *
 * Pipeline:
 *   1. `getListing` — authoritative sold/price detail. Rethrows on error.
 *   2. Apply listing-level thresholds (price, item-sold, sold-last-24h) → `fit`.
 *   3. If it fits: ensure the seller ROW exists (bare upsert from the listing's
 *      `sellerReference`, so the listing's seller FK resolves) — but do NOT fetch
 *      seller stats and do NOT trigger `scanListingsBySeller` (that would loop).
 *      Then upsert `scan_listing` + snapshot. If not: persist nothing.
 *   4. Return the verdict. A fitting verdict carries `isNew` plus the title and
 *      category, so the leaf can send every listing it INSERTED to the LLM at
 *      the end of the run without reading them back.
 */
import type { ScanListing } from "@dashseller/marketplace-scan/types";
import { logger } from "@trigger.dev/sdk";
import type { MobileProfileTokenManager } from "../../utils/mobile-profile-manager";
import type { ScanConfig } from "../../utils/scan-config";
import { extractListingId } from "./extract-listing-id";
import { upsertScanListing } from "./upsert-scan-listing";
import { upsertScanSeller } from "./upsert-scan-seller";

type ScanClient = Awaited<
  ReturnType<MobileProfileTokenManager["createScanClient"]>
>;

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

/** Below the thresholds (or no title); nothing persisted. */
export interface UnfitListingVerdict extends VerdictBase {
  fit: false;
}

export type ListingVerdict = FitListingVerdict | UnfitListingVerdict;

export interface ScanOneListingParams {
  client: ScanClient;
  config: ScanConfig;
  /** Bare listing id or full listing URL — normalized via `extractListingId`. */
  listingId: string;
  manager: MobileProfileTokenManager;
  marketplace: string;
}

/**
 * Scan a single listing with a caller-owned client. Throws on a `getListing`
 * failure (the caller classifies + routes); returns a verdict otherwise.
 */
export async function scanOneListing(
  params: ScanOneListingParams
): Promise<ListingVerdict> {
  const { client, config, manager, marketplace } = params;
  const listingId = extractListingId(params.listingId);

  // Throws on error — the batch loop owns persona-level vs per-listing routing.
  const result = await client.getListing({ listingId });
  // Per-request health refresh (resets failureCount / lastSuccessAt), same as
  // the old single-listing leaf did after each fetch.
  await manager.markUsed();

  const listing = result.listing;
  const sellerReference = listing.sellerReference ?? null;

  const dropReason = checkListingThresholds(listing, marketplace, config);
  if (dropReason) {
    logger.info("Listing did not fit; not persisted", {
      marketplace,
      listingId,
      dropReason,
    });
    return { listingId, fit: false, sellerReference };
  }

  if (!listing.title) {
    logger.warn("Listing detail missing title; skipping persist", {
      marketplace,
      listingId,
    });
    return { listingId, fit: false, sellerReference };
  }

  // Ensure the seller ROW exists (bare upsert from the listing's own
  // sellerReference) so the listing's seller FK resolves now. We do NOT fetch
  // seller stats and do NOT trigger scanListingsBySeller here — that would loop
  // (seller → its catalog leaves → seller → …). The bare row's last_scanned_at
  // stays null, so the cron's stale-seller catch scans it for stats later.
  if (sellerReference) {
    await upsertScanSeller({ marketplace, reference: sellerReference });
  }

  const upserted = await upsertScanListing({
    marketplace,
    reference: listingId,
    sellerReference: listing.sellerReference,
    title: listing.title,
    description: listing.description,
    condition: listing.condition,
    marketplaceCategoryReference: listing.marketplaceCategoryReference,
    categoryPath: listing.categoryPath,
    imageUrls: listing.imageUrls,
    url: listing.url,
    variant: listing.variant,
    goodTillCancelled: listing.goodTillCancelled,
    startedAt: listing.startedAt,
    endedAt: listing.endedAt,
    price: listing.price,
    currency: listing.currency,
    itemSold: listing.itemSold,
    soldLast24h: listing.soldLast24h,
    soldLast30Days: listing.soldLast30Days,
  });

  return {
    listingId,
    fit: true,
    sellerReference,
    scanListingId: upserted.id,
    isNew: upserted.isNew,
    title: listing.title,
    categoryPath: listing.categoryPath ?? null,
    variantsDiscovered: listing.variants.length,
  };
}

/**
 * Apply min-thresholds. Marketplace-aware because shop.app surfaces a 30-day
 * window where eBay surfaces lifetime + 24h — the absolute thresholds in
 * `scan_config` (`minItemSold`, `minSoldLast24h`) are eBay-shaped, so the
 * shop branch falls back to "non-null soldLast30Days qualifies".
 *
 * Stop-gap pending a `scan_config.minSoldLast30Days` knob in PR2.
 */
function checkListingThresholds(
  listing: ScanListing,
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
