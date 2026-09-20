/** Fetch complete detail; thresholds gate discovery, not existing listing history.
 * Fitting listings ensure a seller row and newly inserted rows feed the LLM.
 * Freshness is partitioned once by the leaf, before persona loading.
 */
import {
  validateListingObservation,
  variantPriceRange,
} from "@dashseller/marketplace-scan/listing-observation";
import { db } from "../../utils/db";
import type { MobileProfileTokenManager } from "../../utils/mobile-profile-manager";
import type { ScanConfig } from "../../utils/scan-config";
import { extractListingId } from "./extract-listing-id";
import { checkListingThresholds, type ListingVerdict } from "./listing-verdict";
import { upsertScanListing } from "./upsert-scan-listing";
import { upsertScanSeller } from "./upsert-scan-seller";

export type { ListingVerdict } from "./listing-verdict";

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
 * failure (the caller classifies + routes); returns null for a nonqualifying listing.
 */
export async function scanOneListing(
  params: ScanOneListingParams
): Promise<ListingVerdict | null> {
  const { client, config, manager, marketplace } = params;
  const listingId = extractListingId(params.listingId);

  // Throws on error — the batch loop owns persona-level vs per-listing routing.
  const result = await client.getListing({ listingId });
  // Per-request health refresh (resets failureCount / lastSuccessAt), same as
  // the old single-listing leaf did after each fetch.
  await manager.markUsed();

  const listing = result.listing;
  const sellerReference = listing.sellerReference ?? null;

  if (listing.reference !== listingId || listing.marketplace !== marketplace) {
    throw new Error("Unexpected listing identity");
  }
  validateListingObservation(listing);
  const fit = !checkListingThresholds(
    { ...listing, price: variantPriceRange(listing.variants).priceMin },
    marketplace,
    config
  );
  if (fit && sellerReference) {
    await upsertScanSeller({ marketplace, reference: sellerReference });
  }
  const upserted = await upsertScanListing(db, listing, fit);
  if (!(fit && upserted.id)) {
    return null;
  }

  return {
    listingId,
    sellerReference,
    scanListingId: upserted.id,
    isNew: upserted.isNew,
    title: listing.title,
    categoryPath: listing.categoryPath ?? null,
    variantsDiscovered: listing.variants.length,
  };
}
