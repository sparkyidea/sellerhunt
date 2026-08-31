/**
 * Extract numeric value from eBay price field
 * Handles both plain numbers and {value, currencyID} objects
 */
export function extractPrice(price?: number | { value: number }): number {
  if (!price) {
    return 0;
  }
  return typeof price === "number" ? price : price.value;
}
