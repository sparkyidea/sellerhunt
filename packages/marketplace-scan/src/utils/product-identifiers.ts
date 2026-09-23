/**
 * Item specifics → product identity.
 *
 * Marketplaces hand us a free-text bag of seller-typed name/value pairs, not a
 * schema: the same UPC arrives as "UPC", "Upc" or "Universal Product Code"
 * depending on who listed it. This is the one place that maps those names onto
 * the identity columns (`brand`, `manufacturer` on the listing; `model`, `mpn`,
 * `upc`, `ean`, `isbn`, `gtin` on the variant).
 *
 * Shared across adapters because the problem is the same on every marketplace —
 * eBay's `sellerSpecifiedAspect`, Shopify's metafields — and matching product
 * identity must stay identifier-based (never title phrases), so the extraction
 * rules cannot drift per adapter.
 *
 * Only the bag is interpreted. Nothing is normalized, checksum-validated or
 * converted between identifier systems: a UPC-A is stored as the seller typed
 * it, not widened to GTIN-14. Callers that need a canonical form do that at
 * the matching layer, where both sides of the comparison are available.
 */

export interface ProductIdentifiers {
  brand: string | null;
  ean: string | null;
  gtin: string | null;
  isbn: string | null;
  manufacturer: string | null;
  model: string | null;
  mpn: string | null;
  upc: string | null;
}

/**
 * Values sellers type into an identifier field to mean "there isn't one".
 * Stored verbatim they would poison identifier matching — every listing
 * claiming UPC "Does not apply" would match every other one — so they are
 * read as absent. Compared after `normalizeName`, so punctuation and case
 * don't matter.
 */
const ABSENT_VALUES = new Set([
  "doesnotapply",
  "doesntapply",
  "donotapply",
  "notapplicable",
  "na",
  "none",
  "nonapplicable",
  "nospecified",
  "notspecified",
  "unbranded",
  "unbrandedgeneric",
  "unknown",
]);

/** Aspect names, normalized, that fill each identity field. First hit wins. */
const ALIASES: Record<keyof ProductIdentifiers, string[]> = {
  brand: ["brand", "brandname"],
  ean: ["ean", "ean13", "europeanarticlenumber"],
  gtin: ["gtin", "gtin13", "gtin14", "globaltradeitemnumber"],
  isbn: ["isbn", "isbn10", "isbn13"],
  manufacturer: ["manufacturer", "manufacturername", "madeby"],
  model: ["model", "modelname", "modelnumber", "modelno"],
  mpn: ["mpn", "manufacturerpartnumber", "partnumber", "partno"],
  upc: ["upc", "upca", "upcean", "universalproductcode"],
};

/** Lowercase, strip everything but letters and digits: "Model No." → "modelno". */
function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The value as the seller typed it, or null when it means "no identifier". */
function cleanValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return ABSENT_VALUES.has(normalizeName(trimmed)) ? null : trimmed;
}

/**
 * Read the identity fields out of an item-specifics bag. Every field is null
 * when the bag is null or carries no alias for it — absence is normal, most
 * listings specify only some identifiers.
 */
export function extractProductIdentifiers(
  specifics: Record<string, string> | null | undefined
): ProductIdentifiers {
  const empty: ProductIdentifiers = {
    brand: null,
    ean: null,
    gtin: null,
    isbn: null,
    manufacturer: null,
    model: null,
    mpn: null,
    upc: null,
  };
  if (!specifics) {
    return empty;
  }

  const byNormalizedName = new Map<string, string>();
  for (const [name, value] of Object.entries(specifics)) {
    const key = normalizeName(name);
    // First spelling wins, so a later "UPC/EAN" can't overwrite a plain "UPC".
    if (key && !byNormalizedName.has(key)) {
      byNormalizedName.set(key, value);
    }
  }

  const out = { ...empty };
  for (const [field, aliases] of Object.entries(ALIASES) as [
    keyof ProductIdentifiers,
    string[],
  ][]) {
    for (const alias of aliases) {
      const value = cleanValue(byNormalizedName.get(alias));
      if (value) {
        out[field] = value;
        break;
      }
    }
  }
  return out;
}
