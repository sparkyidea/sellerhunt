/**
 * Generate unique reference for eBay variant
 * Pattern: {listingId}-{key}-{value}[-{key}-{value}...]
 * Example: "406334297966-Color-Black"
 * Multi:   "406334297966-Color-Black-Size-L"
 *
 * Keys are sorted alphabetically to ensure stable references.
 * Preserves all characters including emojis, spaces, and Unicode.
 */
export function generateVariantReference(
  itemId: string | number,
  attributes: Record<string, string>
): string {
  const listingRef = String(itemId);

  const keys = Object.keys(attributes).sort();

  if (keys.length === 0) {
    return listingRef;
  }

  const parts = keys.map((key) => `${key}-${attributes[key]}`);
  return `${listingRef}-${parts.join("-")}`;
}
