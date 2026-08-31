/**
 * Normalize either a full eBay listing URL or a bare listing ID into the
 * numeric item ID. Mirrors the original Odoo scanner's `listing_url` /
 * `listing_id` task-type collapse: same downstream pipeline, two input shapes.
 */
const LISTING_ID_RE = /\b(\d{9,})\b/;

export function extractListingId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("extractListingId: empty input");
  }
  const match = LISTING_ID_RE.exec(trimmed);
  if (!match?.[1]) {
    throw new Error(`extractListingId: no item id found in "${trimmed}"`);
  }
  return match[1];
}
