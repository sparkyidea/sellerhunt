import type { ScanListing, ScanListingVariant } from "../../../../types";
import {
  extractProductIdentifiers,
  type ProductIdentifiers,
} from "../../../../utils/product-identifiers";
import { toCents } from "../../../../utils/to-cents";
import type { Listing as ParsedListing } from "../get-listing";
import { mapVariants } from "./map-variants";

const MARKETPLACE_ID = "ebay";
const ITEM_URL_PREFIX = "https://www.ebay.com/itm/";

export interface MapListingInput {
  listingId: string;
  parsed: ParsedListing;
}

export function mapListing(input: MapListingInput): ScanListing {
  const { listingId, parsed } = input;
  const identifiers = extractProductIdentifiers(parsed.specifics);
  const enumerated = mapVariants(parsed, identifiers);
  if (
    parsed.hasVariations === null ||
    (parsed.hasVariations && enumerated.length === 0) ||
    (!parsed.hasVariations && enumerated.length > 0)
  ) {
    throw new Error("Incomplete or contradictory eBay variant enumeration");
  }
  const hasRealVariations = parsed.hasVariations;
  const variants = hasRealVariations
    ? enumerated
    : [mapSingleVariant(parsed, identifiers)];

  return {
    marketplace: MARKETPLACE_ID,
    reference: listingId,

    sellerReference: parsed.seller?.username ?? null,

    title: parsed.title ?? "",
    description: parsed.description,
    condition: parsed.condition,
    marketplaceCategoryReference: parsed.leafCategoryId,
    categoryPath: parsed.categoryPath.length > 0 ? parsed.categoryPath : null,
    imageUrls: parsed.imageUrls.length > 0 ? parsed.imageUrls : null,
    url: `${ITEM_URL_PREFIX}${listingId}`,

    brand: identifiers.brand,
    manufacturer: identifiers.manufacturer,
    specifics: parsed.specifics,

    type: parsed.listingFormat,

    startedAt: parseIsoDate(parsed.startedAt),
    endedAt: parseIsoDate(parsed.endedAt),

    itemSold: parsed.itemSold,
    soldLast24h: parsed.soldIn24h,
    // eBay doesn't surface a 30-day window — that's shop.app's signal.
    soldLast30Days: null,

    variants,
  };
}

/** Stable default identity only for a confirmed simple listing. */
function mapSingleVariant(
  parsed: ParsedListing,
  identifiers: ProductIdentifiers
): ScanListingVariant {
  return {
    reference: "__default__",
    sku: null,
    attributes: null,
    imageUrls: parsed.imageUrls.length > 0 ? parsed.imageUrls : null,
    price: toCents(parsed.price),
    currency: parsed.currency,
    model: identifiers.model,
    mpn: identifiers.mpn,
    upc: identifiers.upc,
    ean: identifiers.ean,
    isbn: identifiers.isbn,
    gtin: identifiers.gtin,
    // eBay flags sold-out single SKUs in SEMANTIC_DATA_V2; when that module is
    // absent the synthetic itemVariations entry still reports remainingQuantity.
    status:
      parsed.singleSkuOutOfStock || parsed.singleSkuRemainingQuantity === 0
        ? "out_of_stock"
        : "in_stock",
  };
}

function parseIsoDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
