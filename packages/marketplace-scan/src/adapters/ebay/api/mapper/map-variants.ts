import type { ScanListingVariant } from "../../../../types";
import { toCents } from "../../../../utils/to-cents";
import type { Listing as ParsedListing } from "../get-listing";

export function mapVariants(parsed: ParsedListing): ScanListingVariant[] {
  return parsed.variations.map((v) => ({
    reference: v.variationId,
    sku: v.sku,
    currency: v.currency,
    status: v.availableQuantity === 0 ? "out_of_stock" : "in_stock",
    attributes: v.attributes,
    imageUrls: v.imageUrls.length > 0 ? v.imageUrls : null,
    price: toCents(v.price),
  }));
}
