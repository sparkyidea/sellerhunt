/**
 * Seller username → page of listing refs, via eBay's mobile-app search endpoint
 * (`apisd.ebay.com/experience/search/v1/search_results`).
 *
 * Same endpoint as `searchListings`, but scoped by seller (`_ssn=...`)
 * instead of keyword (`_nkw=...`). `meta.pagination.totalPages` is the
 * authoritative stop signal — the endpoint will happily return recycled or
 * recommendation results past the real end if you keep walking, so do not rely
 * on `listings.length === 0`.
 *
 * Same caveats as the rest of `marketplace-scan`: not the public Browse API,
 * JSON shape can change without notice, bearer-token auth is unofficial.
 */
import { ebayFetch } from "../http";
import type { EbaySearchResponse } from "../raw-types/search-response";
import {
  applySearchFilters,
  extractListings,
  extractPagination,
  type ListingRef,
  type PaginationInfo,
  REQUESTED_PAGE_LAYOUTS,
  SEARCH_ENDPOINT,
  type SearchFilterOptions,
  SUPPORTED_UX_COMPONENT_NAMES,
  searchHeaders,
} from "./helper/search";

export type {
  ListingRef,
  ListingRefSeller,
  PaginationInfo,
} from "./helper/search";

export interface GetSellerListingsOptions extends SearchFilterOptions {
  /** Bearer token for the eBay mobile API. */
  authToken: string;
  /** 1-indexed page number. Defaults to 1. */
  page?: number;
  /** eBay seller username, e.g. "sarahabez". */
  sellerId: string;
}

export interface GetSellerListingsResult {
  /** True when `pagination.pageNumber < pagination.totalPages` — safe signal to fetch the next page. */
  hasMore: boolean;
  /** Listing refs found on this page, in display order. */
  listings: ListingRef[];
  /** Pagination metadata from `meta.pagination`. Null if the response omitted it. */
  pagination: PaginationInfo | null;
  /** Raw response body. Shape is sample-derived — see `types/search-response.ts`. */
  raw: EbaySearchResponse;
}

/**
 * Direct layer — build the seller-scoped search request and return the raw
 * response body. No parsing. Sandbox `direct-api/` scripts call this for shape
 * discovery.
 */
export function fetchSellerListings(
  options: GetSellerListingsOptions
): Promise<EbaySearchResponse> {
  const page = options.page ?? 1;
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("answersVersion", "1");
  url.searchParams.set("_pgn", String(page));
  // Page 1 is loaded synchronously by the iOS app; subsequent pages are deferred.
  // Match that — eBay may handle the two modes differently server-side.
  url.searchParams.set("async", page === 1 ? "false" : "true");
  url.searchParams.set("_dkr", "1");
  url.searchParams.set("_vs", "1");
  url.searchParams.set("_oac", "1");
  url.searchParams.set("_blrs", "recall_filtering");
  url.searchParams.set("iconV2Request", "true");
  url.searchParams.set("Experience.cassiniNullLowEnabled", "0");
  url.searchParams.set("_ssn", options.sellerId);
  applySearchFilters(url, options);
  url.searchParams.set("Experience.enableUnifiedRanking", "0");
  url.searchParams.set(
    "supportedUxComponentNames",
    SUPPORTED_UX_COMPONENT_NAMES
  );
  url.searchParams.set("config", "CASSINI_NULL_LOW_ENABLED:false");
  url.searchParams.set(
    "requestedPageLayoutsForMultiLayoutRegion",
    REQUESTED_PAGE_LAYOUTS
  );
  url.searchParams.set("enableDeferredModules", "1");

  return ebayFetch<EbaySearchResponse>({
    endpoint: "ebay.get-seller-listings",
    url: url.toString(),
    headers: searchHeaders(options.authToken),
  });
}

/**
 * Adapter layer — fetch the raw response, then extract listing refs +
 * pagination.
 */
export async function getSellerListings(
  options: GetSellerListingsOptions
): Promise<GetSellerListingsResult> {
  const raw = await fetchSellerListings(options);
  const listings = extractListings(raw);
  const pagination = extractPagination(raw);
  const hasMore = pagination
    ? pagination.pageNumber < pagination.totalPages
    : false;

  return {
    listings,
    pagination,
    hasMore,
    raw,
  };
}
