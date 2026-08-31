/**
 * Convert a Shopify price field (decimal-formatted string like `"949.95"`) to
 * an integer cents value. Returns 0 for null/undefined/empty/unparseable input
 * so callers can use `||` fallbacks the same way the eBay helper does.
 *
 * Shopify GraphQL serializes `Money`/`Decimal` scalars as strings; multiplying
 * the parsed float by 100 then rounding avoids the binary-float drift
 * (`9.99 * 100 = 998.9999...`) that bit early eBay imports.
 */
export function extractPriceCents(price: string | null | undefined): number {
  if (!price) {
    return 0;
  }
  const value = Number.parseFloat(price);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100);
}
