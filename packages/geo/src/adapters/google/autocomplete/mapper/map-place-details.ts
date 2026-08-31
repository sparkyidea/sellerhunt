import type { PlaceDetails } from "../../../../types";
import {
  mapAddressComponents,
  type NormalizedAddressComponent,
} from "../../geocoder/mapper/map-address-components";

/**
 * Raw shape of an `addressComponents[]` entry from Places API
 * (New). Same `types` vocabulary as the legacy Geocoding API; only
 * the key casing differs (`longText` vs `long_name`).
 */
export interface PlacesAddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

/**
 * Raw shape of a single place fetched from Places API (New) via
 * `GET /v1/places/{placeId}` with the field mask
 * `id,formattedAddress,addressComponents,location`.
 */
export interface PlacesApiPlace {
  addressComponents: PlacesAddressComponent[];
  formattedAddress: string;
  id: string;
  location: { latitude: number; longitude: number };
}

export function mapPlaceDetails(place: PlacesApiPlace): PlaceDetails {
  const normalized: NormalizedAddressComponent[] = place.addressComponents.map(
    (c) => ({
      types: c.types,
      longName: c.longText,
      shortName: c.shortText,
    })
  );

  return {
    address: mapAddressComponents(normalized),
    formattedAddress: place.formattedAddress,
    latitude: place.location.latitude,
    longitude: place.location.longitude,
    placeId: place.id,
  };
}
