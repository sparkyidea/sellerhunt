import type {
  Address,
  AutocompleteProvider,
  GeocoderProvider,
  GeocodingResult,
  PlaceDetails,
  Suggestion,
  SuggestOptions,
} from "../types";

/**
 * Geocoding adapter — structured address → lat/lng + normalized address.
 *
 * Adapters accept the same `Partial<Address>` shape the rest of the
 * codebase uses; each adapter internally serializes that into whatever
 * its upstream API wants (a free-form string for Google's Geocoding API,
 * a Text Search query plus strict component verification for Rollo).
 * Hiding the format inside the adapter means callers never duplicate
 * data across "query" and "hints" arguments.
 *
 * `null` return means the provider produced zero matches OR the
 * adapter's verification rejected the top match. Transport, auth,
 * and quota failures throw — the consumer propagates to retry policy
 * (Trigger) or surfaces as a tRPC error.
 */
export interface Geocoder {
  /**
   * Forward geocode from a partial structured address. Pass whatever
   * fields you have — empty / null fields are dropped. Adapters that
   * do strict verification (Rollo) verify the top match's normalized
   * components against the same input fields; adapters that trust
   * their upstream's ranker (Google) just send the joined query.
   */
  geocode(address: Partial<Address>): Promise<GeocodingResult | null>;

  /** Provider identifier — useful for logs and audit trails. */
  getProviderId(): GeocoderProvider;
}

/**
 * Autocomplete adapter — typeahead suggestions + place-details
 * resolution.
 *
 * Two-method shape mirrors Google's session-token billing model:
 * many cheap `suggest` calls plus one `getPlaceDetails` per session
 * bill as a single Autocomplete session.
 *
 * `sessionToken` MUST be a UUID v4 generated client-side and reused
 * for every keystroke in one widget instance plus the final details
 * lookup. Server-side per-request generation defeats the billing
 * batch.
 */
export interface Autocomplete {
  /**
   * Resolve a `Suggestion.placeId` to a full geocoded result.
   *
   * `sessionToken` is optional. Pass the same token used by the
   * preceding `suggest()` calls to close that billed Autocomplete
   * session (cheaper). Omit it for standalone lookups (re-fetching
   * a stored placeId, backend enrichment) — the call bills as a
   * one-off Place Details request.
   */
  getPlaceDetails(
    placeId: string,
    sessionToken?: string
  ): Promise<PlaceDetails>;

  /** Provider identifier — useful for logs and audit trails. */
  getProviderId(): AutocompleteProvider;
  /**
   * Lightweight suggestions for a query string. Returns an empty
   * array (not `null`) for zero matches.
   *
   * `options.countries` is required — global suggestions are
   * unusable in practice.
   */
  suggest(
    query: string,
    sessionToken: string,
    options: SuggestOptions
  ): Promise<Suggestion[]>;
}
