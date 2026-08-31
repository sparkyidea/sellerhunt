/**
 * Public types for `@dashseller/geo`. Consumers import from
 * `@dashseller/geo/types`. Contract interfaces live in `adapters/base.ts`
 * and are re-exported here so this file is the single import surface.
 */
export type { Autocomplete, Geocoder } from "./adapters/base";

/**
 * Geocoding provider — capability discriminator for forward
 * geocoding (address string → lat/lng + normalized components).
 * Reverse geocoding is not part of the package surface.
 */
export type GeocoderProvider = "google" | "rollo";

/**
 * Autocomplete provider — capability discriminator for typeahead
 * address suggestion. Tracked separately from `GeocoderProvider` so
 * providers can join one set without lying about the other.
 */
export type AutocompleteProvider = "google" | "rollo";

/**
 * Geographic coordinate pair. Field names match warehouse and
 * shipment column names (`latitude`, `longitude`, both
 * `doublePrecision`) so consumers can spread directly into drizzle
 * updates.
 */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Normalized postal address. Field names match the warehouse schema
 * 1-to-1 (`address1`, `address2`, `city`, `state`, `zipcode`,
 * `country`). Every field is nullable because providers return
 * sparse data for rural or partial inputs — the caller guards
 * before writing to non-null DB columns.
 */
export interface Address {
  address1: string | null;
  address2: string | null;
  city: string | null;
  /** ISO 3166-1 alpha-2 country code (e.g. "US", "CA"). */
  country: string | null;
  state: string | null;
  zipcode: string | null;
}

/**
 * Forward geocoding result. Carries lat/lng, the structured address
 * the provider normalized to, the provider's single-line rendered
 * address (useful for display), and the stable `placeId` (persist
 * if you want to refetch details later without re-geocoding).
 */
export interface GeocodingResult extends LatLng {
  address: Address;
  formattedAddress: string;
  placeId: string;
}

/**
 * Lightweight autocomplete suggestion. `mainText` is the primary
 * line (e.g. street); `secondaryText` is the qualifier (city,
 * state, country). Resolve to a full `PlaceDetails` via
 * `Autocomplete.getPlaceDetails(placeId, sessionToken)`.
 */
export interface Suggestion {
  mainText: string;
  placeId: string;
  secondaryText: string;
}

/**
 * Resolved place details — same shape as a forward geocode result.
 * A picked Suggestion *is* a geocode.
 */
export type PlaceDetails = GeocodingResult;

/**
 * Resolved config the Google adapters operate on internally. A
 * single Maps Platform key authorizes both the Geocoding API and
 * the Places API (New); scope the key in the Cloud Console.
 *
 * Callers pass `apiKey` before constructing the adapter, so once a config
 * reaches a client it's known-good.
 */
export interface GoogleGeoConfig {
  apiKey: string;
  /** BCP-47 language code for response text. Defaults to "en". */
  language?: string;
}

/**
 * Resolved config the Rollo adapters operate on internally. Rollo
 * proxies the legacy Google Places API using credentials captured
 * from the Rollo iOS app — the adapter pins the
 * `X-Ios-Bundle-Identifier: com.rollo.app` header internally so
 * Google accepts the request as the Rollo app.
 *
 * `apiKey` is supplied by the caller. If Rollo rotates the key (rare, tracks
 * their iOS app build cycle), recapture from the app and update the caller's
 * configured secret.
 */
export interface RolloConfig {
  apiKey: string;
  /** BCP-47 language code for response text. Defaults to "en". */
  language?: string;
}

/**
 * Input shape callers pass to `createGeocoder` / `createAutocomplete`.
 * Caller supplies `apiKey`. The geo package itself reads no environment
 * variables.
 */
export interface GeoFactoryConfig {
  apiKey: string;
  /** BCP-47 language code for response text. Defaults to "en". */
  language?: string;
}

/**
 * Per-call options for `Autocomplete.suggest`. Country restriction
 * is required in practice — global suggestions are unusable for
 * address entry. Pass the seller's target markets as ISO 3166-1
 * alpha-2 codes.
 */
export interface SuggestOptions {
  countries: string[];
  /** Lat/lng to bias suggestion ranking toward (optional). */
  locationBias?: LatLng;
}
