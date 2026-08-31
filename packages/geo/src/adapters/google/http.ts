import { GoogleGeoError } from "./errors";

const GEOCODING_BASE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_NEW_BASE_URL = "https://places.googleapis.com/v1";

/**
 * GET against Google's legacy Geocoding REST API.
 *
 * Throws `GoogleGeoError` on non-2xx HTTP. Does NOT inspect the
 * in-body `status` field — Geocoding API returns HTTP 200 with
 * status fields like `ZERO_RESULTS` or `OVER_QUERY_LIMIT` in the
 * body. The caller decides whether each in-body status means
 * "null" (zero results) or "throw" (auth, quota).
 */
export async function geocodingApiFetch<T>(
  apiKey: string,
  params: Record<string, string>
): Promise<T> {
  const search = new URLSearchParams({ ...params, key: apiKey });
  const url = `${GEOCODING_BASE_URL}?${search.toString()}`;

  const response = await fetch(url, { method: "GET" });
  const rawBody = await response.text();

  if (!response.ok) {
    throw new GoogleGeoError({
      httpStatus: response.status,
      googleStatus: null,
      googleErrorMessage: rawBody.slice(0, 500),
      endpoint: "/maps/api/geocode/json",
    });
  }

  return JSON.parse(rawBody) as T;
}

export interface PlacesApiRequest {
  /** JSON body for POST requests. */
  body?: unknown;
  /** Field mask for the response (X-Goog-FieldMask header). */
  fieldMask: string;
  method: "GET" | "POST";
  /** Path beneath the v1 base, e.g. `/places:autocomplete`. */
  path: string;
  /** Optional query string params (used by GET place-details). */
  query?: Record<string, string>;
}

/**
 * Request against Google's Places API (New).
 *
 * Uses `X-Goog-Api-Key` and `X-Goog-FieldMask` headers (the legacy
 * `key` query param does not authorize Places New). Throws
 * `GoogleGeoError` on non-2xx with the parsed Google error body
 * (`error.status`, `error.message`).
 */
export async function placesApiFetch<T>(
  apiKey: string,
  request: PlacesApiRequest
): Promise<T> {
  const queryString = request.query
    ? `?${new URLSearchParams(request.query).toString()}`
    : "";
  const url = `${PLACES_NEW_BASE_URL}${request.path}${queryString}`;

  const response = await fetch(url, {
    method: request.method,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": request.fieldMask,
    },
    body: request.body ? JSON.stringify(request.body) : undefined,
  });

  const rawBody = await response.text();

  if (!response.ok) {
    const { googleStatus, googleErrorMessage } = extractPlacesError(rawBody);
    throw new GoogleGeoError({
      httpStatus: response.status,
      googleStatus,
      googleErrorMessage,
      endpoint: request.path,
    });
  }

  return JSON.parse(rawBody) as T;
}

function extractPlacesError(rawBody: string): {
  googleStatus: string | null;
  googleErrorMessage: string;
} {
  if (!rawBody) {
    return { googleStatus: null, googleErrorMessage: "Empty response" };
  }
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: { status?: string; message?: string };
    };
    return {
      googleStatus: parsed.error?.status ?? null,
      googleErrorMessage: parsed.error?.message ?? rawBody.slice(0, 500),
    };
  } catch {
    return { googleStatus: null, googleErrorMessage: rawBody.slice(0, 500) };
  }
}
