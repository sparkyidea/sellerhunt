/**
 * Keyword → page of listing refs, via eBay's mobile-app search endpoint
 * (`apisd.ebay.com/experience/search/v1/search_results`).
 *
 * Same endpoint as `getSellerListings`, but scoped by keyword (`_nkw=...`)
 * instead of seller (`_ssn=...`). Each `ListingRef` carries the seller parsed
 * from the search-card footer, so callers that want sellers from a keyword
 * search can derive them from `listings.map(l => l.seller?.username)` without
 * a second request.
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

export interface SearchListingsOptions extends SearchFilterOptions {
  /** Bearer token for the eBay mobile API. */
  authToken: string;
  /** Search query, e.g. "toy". */
  keyword: string;
  /** 1-indexed page number. Defaults to 1. */
  page?: number;
}

export interface SearchListingsResult {
  /** True when `pagination.pageNumber < pagination.totalPages` — safe signal to fetch the next page. */
  hasMore: boolean;
  /** Listing refs found on this page, in display order. Each carries the seller parsed from the card footer. */
  listings: ListingRef[];
  /** Pagination metadata from `meta.pagination`. Null if the response omitted it. */
  pagination: PaginationInfo | null;
  /** Raw response body. Shape is sample-derived — see `types/search-response.ts`. */
  raw: EbaySearchResponse;
}

/**
 * Direct layer — build the keyword search request and return the raw response
 * body. No parsing. Sandbox `direct-api/` scripts call this for shape discovery.
 */
export function fetchSearchListings(
  options: SearchListingsOptions
): Promise<EbaySearchResponse> {
  const page = options.page ?? 1;
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("answersVersion", "1");
  url.searchParams.set("_pgn", String(page));
  url.searchParams.set("async", "false");
  url.searchParams.set("_sop", "12");
  url.searchParams.set("_vs", "1");
  url.searchParams.set("_nkw", options.keyword);
  applySearchFilters(url, options);
  url.searchParams.set(
    "supportedUxComponentNames",
    SUPPORTED_UX_COMPONENT_NAMES
  );
  url.searchParams.set(
    "requestedPageLayoutsForMultiLayoutRegion",
    REQUESTED_PAGE_LAYOUTS
  );
  url.searchParams.set("enableDeferredModules", "1");

  return ebayFetch<EbaySearchResponse>({
    endpoint: "ebay.search-listings",
    url: url.toString(),
    headers: searchHeaders(options.authToken),
  });
}

/**
 * Adapter layer — fetch the raw response, then extract listing refs +
 * pagination.
 */
export async function searchListings(
  options: SearchListingsOptions
): Promise<SearchListingsResult> {
  const raw = await fetchSearchListings(options);
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
