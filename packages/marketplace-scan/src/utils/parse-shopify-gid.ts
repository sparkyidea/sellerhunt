/**
 * Extract the numeric tail from a Shopify Global ID (GID).
 *
 * Shopify's GraphQL surface returns identifiers as
 * `gid://shopify/<Type>/<numeric>` (e.g.
 * `gid://shopify/ProductVariant/44908949897372`). The scan layer stores
 * marketplace identifiers in their bare numeric form so they round-trip
 * cleanly through URLs, sandbox CLIs, and DB queries — same convention as
 * the listing-level `reference` (`"8404160315548"`, not the gid).
 *
 * Returns null if the input doesn't match the gid shape, so callers can
 * decide whether to fall back to the raw value.
 */
const SHOPIFY_GID_RE = /^gid:\/\/shopify\/[^/]+\/(\d+)$/;

export function parseShopifyGid(gid: string | null | undefined): string | null {
  if (typeof gid !== "string") {
    return null;
  }
  return SHOPIFY_GID_RE.exec(gid)?.[1] ?? null;
}
