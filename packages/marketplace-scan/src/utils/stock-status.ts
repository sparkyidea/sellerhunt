import type { ScanListingVariant } from "../types";

/**
 * Stock state of a unit the marketplace still shows. The source's own
 * purchasable flag wins when present; otherwise a reported zero quantity
 * means sold out. A missing signal means in stock: shown and not flagged is
 * buyable, and hidden inventory or backorders stay purchasable. Removal is
 * decided at persistence, never here.
 */
export function stockStatus(
  quantity: number | null,
  availableForSale: boolean | null = null
): ScanListingVariant["status"] {
  if (availableForSale !== null) {
    return availableForSale ? "in_stock" : "out_of_stock";
  }
  return quantity === 0 ? "out_of_stock" : "in_stock";
}
