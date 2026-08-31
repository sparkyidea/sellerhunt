import { createHash } from "node:crypto";
import { stripGid } from "./strip-gid";

/**
 * Stable per-variant reference used by the trigger's variant-matching logic
 * during sync.
 *
 * Prefer the seller-set SKU when present — it survives Shopify product
 * recreation and is what merchants recognize. Otherwise fall back to a short
 * deterministic hash of the stripped product + variant IDs so the reference is
 * stable across pulls of the same SKU-less variant (e.g. gift-card
 * denominations) and matches whether the caller passed full GIDs or already
 * stripped IDs.
 *
 * The eBay equivalent encodes attribute name/value pairs into the reference
 * because eBay variants don't have stable IDs of their own; Shopify variants
 * have stable IDs, so we don't need to embed attributes.
 */
export function generateVariantReference(
  productId: string,
  variantId: string,
  sku: string | null | undefined
): string {
  if (sku && sku.trim().length > 0) {
    return sku.trim();
  }
  const hash = createHash("sha1")
    .update(`${stripGid(productId)}::${stripGid(variantId)}`)
    .digest("hex")
    .slice(0, 16);
  return `shopify-variant-${hash}`;
}
