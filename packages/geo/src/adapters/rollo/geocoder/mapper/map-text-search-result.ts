/**
 * Raw shape of a single `results[]` entry from the legacy Google
 * Places `/textsearch/json` endpoint.
 *
 * Text Search returns up to 20 candidates. We only need the
 * `place_id` to follow up with Place Details for the full
 * structured address; the geometry/formatted_address fields are
 * dropped here because the second call (Place Details) returns
 * them in the unified `GeocodingResult` shape.
 *
 * Other fields Google returns (name, rating, types, photos, etc.)
 * are intentionally untyped — we don't consume them.
 */
export interface LegacyTextSearchResult {
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
  place_id: string;
}

/**
 * Minimal handle returned by the text-search step of the Rollo
 * geocoder pipeline. The `placeId` feeds Place Details; the
 * `formattedAddress` is surfaced only for sandbox/log readability.
 */
export interface TopTextSearchHit {
  formattedAddress: string;
  placeId: string;
}

export function mapTextSearchTopResult(
  result: LegacyTextSearchResult
): TopTextSearchHit {
  return {
    formattedAddress: result.formatted_address,
    placeId: result.place_id,
  };
}
