import type { PlaceDetails } from "../../../../types";
import {
  mapAddressComponents,
  type NormalizedAddressComponent,
} from "../../../google/geocoder/mapper/map-address-components";

/**
 * Raw shape of an `address_components[]` entry from the legacy
 * Google Places `/details/json` endpoint. Same field naming and
 * `types` vocabulary as the Geocoding API, so the address-component
 * mapper is shared via `google/geocoder/mapper`.
 */
export interface LegacyAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

/**
 * Raw shape of the `result` field returned by
 * `GET /maps/api/place/details/json` (legacy Places API, `fields=ALL`).
 *
 * Only the fields this mapper consumes are typed — Google returns
 * many more (phone numbers, opening hours, photos, etc.).
 */
export interface LegacyPlaceDetailsResult {
  address_components: LegacyAddressComponent[];
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
  place_id: string;
}

export function mapPlaceDetails(
  result: LegacyPlaceDetailsResult
): PlaceDetails {
  const normalized: NormalizedAddressComponent[] =
    result.address_components.map((c) => ({
      longName: c.long_name,
      shortName: c.short_name,
      types: c.types,
    }));

  return {
    address: mapAddressComponents(normalized),
    formattedAddress: result.formatted_address,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
    placeId: result.place_id,
  };
}
