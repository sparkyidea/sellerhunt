import type { GoogleGeoConfig, PlaceDetails } from "../../../types";
import { placesApiFetch } from "../http";
import {
  mapPlaceDetails,
  type PlacesApiPlace,
} from "./mapper/map-place-details";

const PLACE_DETAILS_FIELD_MASK =
  "id,formattedAddress,addressComponents,location";

export async function getPlaceDetails(
  config: GoogleGeoConfig,
  placeId: string,
  sessionToken?: string
): Promise<PlaceDetails> {
  const query: Record<string, string> = {
    languageCode: config.language ?? "en",
  };
  if (sessionToken) {
    query.sessionToken = sessionToken;
  }

  const place = await placesApiFetch<PlacesApiPlace>(config.apiKey, {
    fieldMask: PLACE_DETAILS_FIELD_MASK,
    method: "GET",
    path: `/places/${encodeURIComponent(placeId)}`,
    query,
  });

  return mapPlaceDetails(place);
}
