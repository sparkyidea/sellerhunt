/**
 * eBay parsed variations → unified `ScanListingVariant[]`.
 *
 * Mirrors `packages/marketplace/src/adapters/ebay/api/mapper/map-variants.ts`:
 * one exported `mapVariants(...)` function per file, called by the
 * top-level `mapListing` mapper.
 *
 * Returns an empty array for single-item listings (no MSKU module on the
 * source response → `parsed.variations` is empty). The top-level mapper
 * falls back to `mapSingleVariant` in that case, matching the seller-side
 * eBay mapper pattern.
 */
import type { ScanListingVariant } from "../../../../types";
import { toCents } from "../../../../utils/to-cents";
import type { Listing as ParsedListing } from "../get-listing";

export function mapVariants(parsed: ParsedListing): ScanListingVariant[] {
  return parsed.variations.map((v) => ({
    reference: v.variationId,
    attributes: v.attributes,
    imageUrls: v.imageUrls.length > 0 ? v.imageUrls : null,
    price: toCents(v.price),
  }));
}
