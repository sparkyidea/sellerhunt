/**
 * eBay parsed listing → unified `ScanListing` (the form for one
 * `scan_listing` row + its nested variant children).
 *
 * Pure function — exported for unit tests, called inside the eBay adapter's
 * `getListing`. Drops marketplace-specific fields the unified shape doesn't
 * carry (`conditionId`, `listingFormat`, `marketplaceListedOn`, `watchCount`)
 * and renames `soldIn24h` → `soldLast24h` to match the schema.
 *
 * The mapper sets `listing.sellerReference` to the seller's username so the
 * FK to `scan_seller` resolves at the upsert boundary. The full seller form
 * (display name, reputation) is NOT produced here — that's the job of the
 * `getSeller` adapter, called separately.
 *
 * Variant pattern: always emits at least one variant row.
 * - When eBay returns multi-variation rows (`itemVariations[]` populated):
 *   `mapVariants` converts each into a `ScanListingVariant` with attributes
 *   from the aspects block.
 * - When eBay returns no variations (single-item listings): synthesize a
 *   single variant from the listing-level price/images via
 *   `mapSingleVariant`. Mirrors the seller-side eBay mapper pattern.
 *
 * `variant: boolean` flips true only when the source returned ≥1 real
 * variation (i.e. before the synthesis fallback).
 */
import type { ScanListing, ScanListingVariant } from "../../../../types";
import { toCents } from "../../../../utils/to-cents";
import type { Listing as ParsedListing } from "../get-listing";
import { mapVariants } from "./map-variants";

const MARKETPLACE_ID = "ebay";
const ITEM_URL_PREFIX = "https://www.ebay.com/itm/";

export interface MapListingInput {
  listingId: string;
  parsed: ParsedListing;
}

export function mapListing(input: MapListingInput): ScanListing {
  const { listingId, parsed } = input;
  const enumerated = mapVariants(parsed);
  const hasRealVariations = enumerated.length > 0;
  const variants = hasRealVariations
    ? enumerated
    : [mapSingleVariant(listingId, parsed)];

  return {
    marketplace: MARKETPLACE_ID,
    reference: listingId,

    sellerReference: parsed.seller?.username ?? null,

    title: parsed.title ?? "",
    description: parsed.description,
    condition: parsed.condition,
    // eBay's leaf category id isn't currently extracted from VLS; flag for
    // a future pass through the listing classification block.
    marketplaceCategoryReference: null,
    categoryPath: parsed.categoryPath.length > 0 ? parsed.categoryPath : null,
    imageUrls: parsed.imageUrls.length > 0 ? parsed.imageUrls : null,
    url: `${ITEM_URL_PREFIX}${listingId}`,
    variant: hasRealVariations,

    goodTillCancelled: parsed.goodTillCancelled,
    startedAt: parseIsoDate(parsed.startedAt),
    endedAt: parseIsoDate(parsed.endedAt),

    price: toCents(parsed.price),
    currency: parsed.currency,
    itemSold: parsed.itemSold,
    soldLast24h: parsed.soldIn24h,
    // eBay doesn't surface a 30-day window — that's shop.app's signal.
    soldLast30Days: null,

    variants,
  };
}

/**
 * Emit a single synthetic variant for the listing — mirrors
 * `mapSingleVariant` in `packages/marketplace/src/adapters/ebay/api/mapper/map-listing.ts`.
 * Uses the listingId as the variant reference (the unique key on
 * `scan_listing_variant` is `(listingId, reference)`, so reusing the
 * listingId is unambiguous for the single-variant case). Inherits the
 * listing's images and price.
 *
 * Once PR2 wires real eBay variant enumeration via `mapVariants` (sibling
 * `map-variants.ts`, mirroring the seller-side file split), this function
 * will only be called when the source returned no variations — same gating
 * pattern as the marketplace seller-side mapper.
 */
function mapSingleVariant(
  listingId: string,
  parsed: ParsedListing
): ScanListingVariant {
  return {
    reference: listingId,
    attributes: null,
    imageUrls: parsed.imageUrls.length > 0 ? parsed.imageUrls : null,
    price: toCents(parsed.price),
  };
}

function parseIsoDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
