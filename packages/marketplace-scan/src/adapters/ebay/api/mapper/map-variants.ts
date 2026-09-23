import type { ScanListingVariant } from "../../../../types";
import type { ProductIdentifiers } from "../../../../utils/product-identifiers";
import { toCents } from "../../../../utils/to-cents";
import type { Listing as ParsedListing } from "../get-listing";

/**
 * Map eBay's MSKU variations to variant rows.
 *
 * `identifiers` come from the listing-level item specifics: eBay carries UPC,
 * MPN and model on the listing, not per variation, so every unit of one
 * listing inherits the same values. Where a seller really does list one UPC
 * per variation, eBay exposes it as an option aspect, which stays in
 * `attributes`.
 */
export function mapVariants(
  parsed: ParsedListing,
  identifiers: ProductIdentifiers
): ScanListingVariant[] {
  return parsed.variations.map((v) => ({
    reference: v.variationId,
    sku: v.sku,
    currency: v.currency,
    status: v.availableQuantity === 0 ? "out_of_stock" : "in_stock",
    attributes: v.attributes,
    imageUrls: v.imageUrls.length > 0 ? v.imageUrls : null,
    price: toCents(v.price),
    model: identifiers.model,
    mpn: identifiers.mpn,
    upc: identifiers.upc,
    ean: identifiers.ean,
    isbn: identifiers.isbn,
    gtin: identifiers.gtin,
  }));
}
