import type { ScanListingVariant } from "../../../../types";
import { parseShopifyGid } from "../../../../utils/parse-shopify-gid";
import { toCents } from "../../../../utils/to-cents";
import type {
  ParsedVariant,
  ShopVariantOption,
} from "../get-adjacent-variants";

export function mapVariants(variants: ParsedVariant[]): ScanListingVariant[] {
  return variants.map(toScanVariant);
}

function toScanVariant(v: ParsedVariant): ScanListingVariant {
  return {
    // Strip the `gid://shopify/ProductVariant/` wrapper so the reference
    // matches the bare-numeric convention used for the listing reference.
    // Falls back to the raw value if the shape ever drifts.
    reference: parseShopifyGid(v.id) ?? v.id,
    sku: null,
    currency: v.currency,
    status: v.availableForSale === false ? "out_of_stock" : "in_stock",
    attributes: isPlaceholderOptions(v.selectedOptions)
      ? null
      : Object.fromEntries(v.selectedOptions.map((o) => [o.name, o.value])),
    imageUrls: v.imageUrl ? [v.imageUrl] : null,
    price: toCents(v.price),
    // Shopify carries `barcode` (GTIN/UPC) and `vendor` on the product, but
    // the shop.app query doesn't request them yet — wiring that is its own
    // change, in the query and the parser as well as here.
    model: null,
    mpn: null,
    upc: null,
    ean: null,
    isbn: null,
    gtin: null,
  };
}

/**
 * Shopify's single-variant placeholder uses `selectedOptions = [{name:
 * "Title", value: "Default Title"}]`. Treat that — and an entirely empty
 * options array — as "no real attributes" so the variant row carries
 * `attributes: null` rather than a meaningless map.
 */
function isPlaceholderOptions(options: ShopVariantOption[]): boolean {
  if (options.length === 0) {
    return true;
  }
  if (
    options.length === 1 &&
    options[0]?.name === "Title" &&
    options[0]?.value === "Default Title"
  ) {
    return true;
  }
  return false;
}
