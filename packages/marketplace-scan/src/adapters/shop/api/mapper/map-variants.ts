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
    status: stockStatus(v.quantityAvailable),
    attributes: isPlaceholderOptions(v.selectedOptions)
      ? null
      : Object.fromEntries(v.selectedOptions.map((o) => [o.name, o.value])),
    imageUrls: v.imageUrl ? [v.imageUrl] : null,
    price: toCents(v.price),
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

/** Exact reported quantity establishes stock; availability alone may allow backorders. */
function stockStatus(quantity: number | null): ScanListingVariant["status"] {
  if (quantity === null || !Number.isSafeInteger(quantity) || quantity < 0) {
    return null;
  }
  return quantity > 0 ? "in_stock" : "out_of_stock";
}
