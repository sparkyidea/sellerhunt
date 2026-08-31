import type { GeocodingResult } from "../../../../types";
import {
  mapAddressComponents,
  type NormalizedAddressComponent,
} from "./map-address-components";

/**
 * Raw shape of an `address_components[]` entry from Google's
 * Geocoding REST API (snake_case).
 */
export interface GeocodingApiAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

/**
 * Raw shape of a single `results[]` entry from Google's Geocoding
 * REST API. Only the fields this mapper consumes are typed —
 * Google returns more.
 */
export interface GeocodingApiResult {
  address_components: GeocodingApiAddressComponent[];
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
  place_id: string;
}

/**
 * Raw envelope of a Geocoding API response. `status` is in-body
 * (HTTP is always 200 on a valid request) — caller checks it.
 */
export interface GeocodingApiResponse {
  error_message?: string;
  results: GeocodingApiResult[];
  status: string;
}

export function mapResult(result: GeocodingApiResult): GeocodingResult {
  const normalized: NormalizedAddressComponent[] =
    result.address_components.map((c) => ({
      types: c.types,
      longName: c.long_name,
      shortName: c.short_name,
    }));

  return {
    address: mapAddressComponents(normalized),
    formattedAddress: result.formatted_address,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
    placeId: result.place_id,
  };
}
