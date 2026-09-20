import { sql } from "drizzle-orm";

/** Same complete/common-currency rule as variantPriceRange, evaluated before caching/filtering. */
export function listingPriceMin() {
  // Keep the outer ID qualified: Drizzle strips column qualifiers from a
  // single-table SELECT, which would otherwise bind "id" to the inner unit.
  return sql<number | null>`(SELECT CASE
    WHEN count(*) = count(unit.price) AND count(*) = count(nullif(unit.currency, ''))
      AND count(DISTINCT unit.currency) = 1
    THEN min(unit.price) END
    FROM scan_listing_variant unit
    WHERE unit.listing_id = "scan_listing"."id"
      AND unit.status IS DISTINCT FROM 'removed')`;
}
