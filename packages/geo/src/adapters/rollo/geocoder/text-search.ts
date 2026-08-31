import type { RolloConfig } from "../../../types";
import { RolloError } from "../errors";
import { rolloFetch } from "../http";
import {
  type LegacyTextSearchResult,
  mapTextSearchTopResult,
  type TopTextSearchHit,
} from "./mapper/map-text-search-result";

interface LegacyTextSearchResponse {
  error_message?: string;
  results: LegacyTextSearchResult[];
  status: string;
}

/**
 * Calls Rollo's authorized legacy Places Text Search endpoint and
 * returns just the top hit (placeId + formattedAddress). Used by
 * `RolloGeocoder.geocode` to discover the place that matches a
 * free-form address string before fetching its structured details.
 *
 * Returns `null` if the API reports `ZERO_RESULTS` or returns an
 * empty `results[]`. Throws `RolloError` for `REQUEST_DENIED` /
 * `OVER_QUERY_LIMIT` / transport failures.
 */
export async function textSearch(
  config: RolloConfig,
  query: string
): Promise<TopTextSearchHit | null> {
  const response = await rolloFetch<LegacyTextSearchResponse>(config.apiKey, {
    path: "/textsearch/json",
    query: {
      language: config.language ?? "en",
      query,
    },
  });

  if (response.status === "ZERO_RESULTS") {
    return null;
  }

  if (response.status !== "OK") {
    throw new RolloError({
      endpoint: "/textsearch/json",
      googleErrorMessage: response.error_message ?? "Unknown text-search error",
      googleStatus: response.status,
      httpStatus: 200,
    });
  }

  const top = response.results[0];
  if (!top) {
    return null;
  }

  return mapTextSearchTopResult(top);
}
