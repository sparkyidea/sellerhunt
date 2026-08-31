/**
 * Shared HTTP + parsing helpers for eBay's mobile search endpoint
 * (`apisd.ebay.com/experience/search/v1/search_results`). The same endpoint
 * backs both `getSellerListings` (scoped by `_ssn=`) and `searchListings`
 * (scoped by `_nkw=`) — only the URL params differ. Response shape, headers,
 * and the ListingRef parser are identical, so they live here.
 */
import type {
  EbaySearchModule,
  EbaySearchResponse,
  ItemModule,
} from "../../raw-types/search-response";

export const SEARCH_ENDPOINT =
  "https://apisd.ebay.com/experience/search/v1/search_results";

export const SUPPORTED_UX_COMPONENT_NAMES = [
  "ITEM_CARD",
  "DENSE_ITEM_CARD",
  "REWRITES_ITEMS",
  "REWRITE_START",
  "BASIC_MESSAGE",
  "TWO_LINE_MESSAGE",
  "BASIC_USER_MESSAGE",
  "BASIC_SELLER_HEADER",
  "PROMOTED_ITEM_CARD",
  "VEHICLE_PARTS_FINDER",
  "MOTORS_TIRE_FINDER",
  "TOP_OF_PAGE_FINDER",
  "TOP_OF_PAGE_WITH_VEHICLE",
  "TOP_OF_PAGE_TIRE",
  "GARAGE_ONE_CLICK_FINDER",
  "UNIVERSAL_FINDER",
  "STATUS_BAR_V2",
  "ICON_MESSAGE",
  "TOGGLE_MESSAGE",
  "STORE_INFORMATION",
  "PRESENCE_INFORMATION_V3",
  "FIRST_PARTY_ADS_BANNER",
  "ITEMS_CAROUSEL_V3",
  "NAVIGATION_ANSWER_PILL_CAROUSEL",
  "NAVIGATION_IMAGE_ANSWER_CAROUSEL",
  "NAVIGATION_ANSWER_TEXT_LIST",
  "NAVIGATION_ANSWER_SIMPLE_IMAGE_CAROUSEL",
  "IMAGE_ANSWER_GUIDANCE_CAROUSEL",
  "PAGE_TITLE_BAR",
  "ASPECTS_IN_RIVER",
  "ITEM_CAROUSEL_BOS",
  "GRID_VIEW_ITEM_CAROUSEL_BOS",
  "EDUCATION",
  "SAVED_ASPECTS_ENTRY",
  "SAVED_ASPECTS_SNACKBAR",
  "IMAGE_ANSWER_TABBED_CAROUSEL",
  "SNACK_BAR",
  "COLD_START_BOTTOM_DRAWER_FINDER",
  "SAVE_CARD",
  "AD_PD_S2",
  "SPECTRUM_OF_VALUE_CAROUSEL",
  "EEK_ICON",
  "SPONSORED_BADGE",
  "ITEMS_CAROUSEL_WITH_COLOR",
  "SELLER_OFFER_TAPPABLE_HEADER",
  "BOS_PLACEHOLDER",
  "CAQ_PLACEHOLDER",
  "SEEK_FEEDBACK_COMPONENT",
  "SEARCH_PRICE_TRENDS",
  "ORGANIZED_RESULTS_CAROUSEL",
  "NAVIGATION_ANSWER_TOGGLE_WITH_PILL_CAROUSEL",
  "BUTTON_WITH_MESSAGE",
  "SEARCH_OSR_MAG_CAROUSEL",
  "ORGANIZED_RESULTS_GRID",
  "OSR_BY_KEYWORDS_CAROUSEL",
  "MODEL_PRICE_GUIDANCE",
  "PBE_MODEL",
  "MODELS_CAROUSEL",
  "PBE_SERIES",
].join(",");

export const REQUESTED_PAGE_LAYOUTS =
  "LIST_1_COLUMN,LARGE_1_COLUMN,GRID_2_COLUMN";

/**
 * Per-call headers the search endpoint needs on top of `ebayFetch`'s ambient
 * set: the search-specific `Accept` variant and the bearer.
 */
export function searchHeaders(authToken: string): Record<string, string> {
  return {
    Accept: "application/json;presentity=inline",
    Authorization: `Bearer ${authToken}`,
  };
}

/** Optional price-band filters, shared by keyword + seller-scoped search. */
export interface SearchFilterOptions {
  /** Cap on listing price in **integer cents**. Emits `_udhi` when set; NULL/undefined = no cap. */
  maxPriceCents?: number | null;
  /** Floor on listing price in **integer cents**. Emits `_udlo` when > 0. */
  minPriceCents?: number | null;
}

/**
 * Apply the URL-level result filters eBay's mobile app sends when the user
 * narrows a search. Same endpoint backs keyword (`_nkw`) and seller (`_ssn`)
 * scoped queries, so both filter identically — this pushes work eBay can do
 * server-side off our fan-out (sellers/listings outside the band are never
 * discovered or detail-fetched).
 *
 *   - `LH_BIN=1`      fixed-price (Buy It Now) only; auctions excluded. Always
 *                     on: sold-velocity analysis is meaningless for auctions.
 *   - `_fsrp=1`       eBay's "filtered search result page" flag — set whenever
 *                     any filter is active, mirroring the app's filtered request.
 *   - `_udlo`/`_udhi` price band in **dollars** (`scan_config` stores cents,
 *                     so divide by 100). `_udlo` only when a floor > 0 is set;
 *                     `_udhi` only when a cap is present.
 *
 * Listing-level thresholds that aren't URL-filterable (itemSold, soldLast24h)
 * stay in the post-fetch `checkListingThresholds`; the client-side price check
 * remains there too as an authoritative safety net against stale search prices.
 */
export function applySearchFilters(
  url: URL,
  options: SearchFilterOptions = {}
): void {
  url.searchParams.set("LH_BIN", "1");
  url.searchParams.set("_fsrp", "1");

  const minCents = options.minPriceCents ?? 0;
  if (minCents > 0) {
    url.searchParams.set("_udlo", centsToDollarParam(minCents));
  }
  const maxCents = options.maxPriceCents ?? null;
  if (maxCents !== null) {
    url.searchParams.set("_udhi", centsToDollarParam(maxCents));
  }
}

/** eBay's `_udlo`/`_udhi` are dollars; keep cent precision (1099 → "10.99"). */
function centsToDollarParam(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface PaginationInfo {
  /** eBay's reported page size; `listings.length` may be lower (cards mixed with ads). */
  entriesPerPage: number;
  /** 1-indexed page number echoed by eBay. */
  pageNumber: number;
  /** Total listings matching the query. */
  totalEntries: number;
  /** Total pages available; reaching this value means no more pages. */
  totalPages: number;
}

/**
 * Lightweight listing identifier + display fields available on the search
 * results page. Use `getListing` (separate adapter) for sold count,
 * sold-in-24h, full description, category breadcrumb, and other
 * detail-page-only fields.
 */
export interface ListingRef {
  /** Item condition string from search badge, e.g. "Brand New", "Pre-Owned". */
  condition: string | null;
  /** ISO-4217 currency code, e.g. "USD". */
  currency: string | null;
  /** First image URL from the search card. */
  imageUrl: string | null;
  /** Free-form location string, e.g. "Located in United States". */
  itemLocation: string | null;
  /** eBay item ID. */
  listingId: string;
  /** Canonical listing URL extracted from the search card. */
  listingUrl: string;
  /** Display price as a number (the same value eBay shows in the card). */
  price: number | null;
  /** Free-form availability text, e.g. "1 remaining", "12 sold". */
  quantityText: string | null;
  /**
   * Seller parsed from the search-card footer ("username (count) percent%").
   * Null when eBay omitted the footer (rare). On a seller-scoped query this
   * matches the requested seller for every card.
   */
  seller: ListingRefSeller | null;
  /** Free-form shipping text, e.g. "+$6.95 delivery", "Free shipping". */
  shippingText: string | null;
  /**
   * Units sold from the search-card "X sold" badge ("127 sold", "1,541+ sold").
   * Null when eBay omits the badge — i.e. the card shows no demonstrated sales.
   * A "+" suffix is a floor, so the parsed number is a lower bound on real sales.
   * Roughly the same lifetime measure as detail-page `itemSold`, so it can gate
   * `minItemSold` at the search stage before any detail fetch.
   */
  soldCount: number | null;
  /** Listing title, joined from textSpans. */
  title: string;
}

export interface ListingRefSeller {
  /** % positive feedback, normalized to 0..1 (e.g. 99.4% → 0.994). */
  feedbackPercent: number | null;
  /** Lifetime feedback count. */
  feedbackScore: number | null;
  /** eBay seller username. */
  username: string;
}

export function extractPagination(
  raw: EbaySearchResponse
): PaginationInfo | null {
  const p = raw.meta?.pagination;
  if (!p) {
    return null;
  }
  return {
    entriesPerPage: p.entriesPerPage,
    pageNumber: p.pageNumber,
    totalEntries: p.totalEntries,
    totalPages: p.totalPages,
  };
}

/**
 * Walk the synchronous `modules` AND every `deferred_modules` group, pulling
 * each `_type === "ITEM"` entry into a normalized ListingRef. Order is
 * preserved (eBay's own ranking), synchronous river first.
 *
 * `enableDeferredModules=1` (set on every search/seller request) makes eBay
 * split the river: the first cards land in `modules`, the rest in
 * `deferred_modules`. Reading only `modules` silently dropped ~85% of each
 * page. Dedup by `listingId` is defensive — a card can appear in both groups.
 */
export function extractListings(raw: EbaySearchResponse): ListingRef[] {
  const out: ListingRef[] = [];
  const seen = new Set<string>();
  collectItems(raw.modules, seen, out);
  if (raw.deferred_modules) {
    for (const group of raw.deferred_modules) {
      collectItems(group, seen, out);
    }
  }
  return out;
}

function collectItems(
  modules: Record<string, EbaySearchModule> | undefined,
  seen: Set<string>,
  out: ListingRef[]
): void {
  if (!modules) {
    return;
  }
  for (const value of Object.values(modules)) {
    if (!value || value._type !== "ITEM") {
      continue;
    }
    if (seen.has(value.listingId)) {
      continue;
    }
    seen.add(value.listingId);
    out.push(toListingRef(value));
  }
}

/**
 * Match the seller-info text format eBay's mobile search uses:
 *   "epic-bargain-finds (557) 99.4%"
 *   "benwa24comcastnet (1,397) 97.5%"
 *   "mctoylady (5,571) 100%"
 */
const SELLER_INFO_RE = /^([\w.-]+)\s*\(([\d,]+)\)\s+(\d+(?:\.\d+)?)%/;

function toListingRef(item: ItemModule): ListingRef {
  return {
    condition: item.__search?.normalizedCondition?.text ?? null,
    currency: item.displayPrice?.value?.currency ?? null,
    imageUrl: item.image?.URL ?? null,
    itemLocation: item.__search?.itemLocation?.text ?? null,
    listingId: item.listingId,
    listingUrl:
      item.action?.URL ?? `https://www.ebay.com/itm/${item.listingId}`,
    price:
      typeof item.displayPrice?.value?.value === "number"
        ? item.displayPrice.value.value
        : null,
    quantityText: joinSpans(item.quantity?.textSpans) || null,
    seller: extractSeller(item),
    shippingText: joinSpans(item.logisticsCost?.textSpans) || null,
    soldCount: extractSoldCount(item),
    title: joinSpans(item.title?.textSpans),
  };
}

/** "127 sold", "3,450 sold", "398+ sold" → the leading number (commas stripped). */
const SOLD_COUNT_RE = /([\d,]+)\+?\s*sold/i;

function extractSoldCount(item: ItemModule): number | null {
  const text = joinSpans(item.__search?.quantitySold?.text?.textSpans);
  const match = SOLD_COUNT_RE.exec(text);
  if (!match?.[1]) {
    return null;
  }
  const count = Number.parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(count) ? count : null;
}

function extractSeller(item: ItemModule): ListingRefSeller | null {
  const text = item.__search?.sellerInfo?.text?.textSpans?.[0]?.text;
  if (!text) {
    return null;
  }
  const match = SELLER_INFO_RE.exec(text);
  const username = match?.[1];
  if (!username) {
    return null;
  }
  const scoreRaw = match[2]?.replace(/,/g, "") ?? "";
  const score = Number.parseInt(scoreRaw, 10);
  const pct = Number.parseFloat(match[3] ?? "");
  return {
    feedbackPercent: Number.isFinite(pct) ? pct / 100 : null,
    feedbackScore: Number.isFinite(score) ? score : null,
    username,
  };
}

function joinSpans(
  spans: ReadonlyArray<{ text?: string }> | undefined
): string {
  if (!spans) {
    return "";
  }
  return spans.map((span) => span.text ?? "").join("");
}
