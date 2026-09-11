/** Fetch authoritative detail and persist any titled observation with its qualification.
 * Only fitting listings ensure a seller row and newly inserted fitting rows feed the LLM.
 * Freshness is partitioned once by the leaf, before persona loading.
 */
import { logger } from "@trigger.dev/sdk";
import type { MobileProfileTokenManager } from "../../utils/mobile-profile-manager";
import type { ScanConfig } from "../../utils/scan-config";
import { extractListingId } from "./extract-listing-id";
import { checkListingThresholds, type ListingVerdict } from "./listing-verdict";
import { upsertScanListing } from "./upsert-scan-listing";
import { upsertScanSeller } from "./upsert-scan-seller";

export type {
  FitListingVerdict,
  ListingVerdict,
  UnfitListingVerdict,
} from "./listing-verdict";

type ScanClient = Awaited<
  ReturnType<MobileProfileTokenManager["createScanClient"]>
>;

export interface ScanOneListingParams {
  client: Pick<ScanClient, "getListing">;
  config: ScanConfig;
  /** Bare listing id or full listing URL — normalized via `extractListingId`. */
  listingId: string;
  manager: Pick<MobileProfileTokenManager, "markUsed">;
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

  if (!listing.title) {
    logger.warn("Listing detail missing title; skipping persist", {
      marketplace,
      listingId,
    });
    return { listingId, fit: false, sellerReference };
  }

  const dropReason = checkListingThresholds(listing, marketplace, config);
  const qualified = dropReason === null;
  if (qualified && sellerReference) {
    await upsertScanSeller({ marketplace, reference: sellerReference });
  }
  const upserted = await upsertScanListing({
    qualified,
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

  if (!qualified) {
    logger.info("Persisted unqualified listing observation", {
      marketplace,
      listingId,
      dropReason,
    });
    return {
      listingId,
      fit: false,
      sellerReference,
      scanListingId: upserted.id,
    };
  }
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
