import { RolloError } from "./errors";

const BASE_URL = "https://maps.googleapis.com/maps/api/place";

/**
 * Header value Rollo's iOS app sends to authorize the legacy
 * Places API key against Google's bundle-identifier restriction.
 * Pinned — if Rollo rebuilds with a new bundle the captured key
 * also rotates, so this constant moves in lockstep with `apiKey`.
 */
const IOS_BUNDLE_IDENTIFIER = "com.rollo.app";

export interface RolloRequest {
  /** Path beneath `/maps/api/place`, e.g. `/autocomplete/json`. */
  path: string;
  /** Query string params (excluding `key`, added by the helper). */
  query: Record<string, string>;
}

/**
 * GET against the legacy Google Places API with Rollo's iOS bundle
 * identifier header.
 *
 * Throws `RolloError` on non-2xx HTTP. Does NOT inspect the in-body
 * `status` field — legacy Places API returns HTTP 200 with status
 * fields like `ZERO_RESULTS` or `OVER_QUERY_LIMIT` in the body; the
 * caller decides whether each in-body status means "null" or
 * "throw".
 */
export async function rolloFetch<T>(
  apiKey: string,
  request: RolloRequest
): Promise<T> {
  const search = new URLSearchParams({ ...request.query, key: apiKey });
  const url = `${BASE_URL}${request.path}?${search.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Ios-Bundle-Identifier": IOS_BUNDLE_IDENTIFIER,
    },
  });

  const rawBody = await response.text();

  if (!response.ok) {
    throw new RolloError({
      endpoint: request.path,
      googleErrorMessage: rawBody.slice(0, 500),
      googleStatus: null,
      httpStatus: response.status,
    });
  }

  return JSON.parse(rawBody) as T;
}
