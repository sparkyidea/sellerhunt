import type {
  GoogleGeoConfig,
  Suggestion,
  SuggestOptions,
} from "../../../types";
import { placesApiFetch } from "../http";
import { mapSuggestion, type PlacePrediction } from "./mapper/map-suggestion";

const SUGGEST_FIELD_MASK =
  "suggestions.placePrediction.placeId," +
  "suggestions.placePrediction.structuredFormat.mainText," +
  "suggestions.placePrediction.structuredFormat.secondaryText";

/**
 * Radius (meters) used to wrap a single `LatLng` bias as a Places
 * API circle. ~50km is wide enough to nudge ranking without
 * restricting results too tightly.
 */
const LOCATION_BIAS_RADIUS_METERS = 50_000;

interface SuggestApiResponse {
  suggestions?: Array<{ placePrediction?: PlacePrediction }>;
}

export async function suggest(
  config: GoogleGeoConfig,
  query: string,
  sessionToken: string,
  options: SuggestOptions
): Promise<Suggestion[]> {
  const body: Record<string, unknown> = {
    input: query,
    sessionToken,
    includedRegionCodes: options.countries,
    languageCode: config.language ?? "en",
  };

  if (options.locationBias) {
    body.locationBias = {
      circle: {
        center: {
          latitude: options.locationBias.latitude,
          longitude: options.locationBias.longitude,
        },
        radius: LOCATION_BIAS_RADIUS_METERS,
      },
    };
  }

  const response = await placesApiFetch<SuggestApiResponse>(config.apiKey, {
    path: "/places:autocomplete",
    method: "POST",
    body,
    fieldMask: SUGGEST_FIELD_MASK,
  });

  const placePredictions = (response.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is PlacePrediction => p !== undefined);

  return placePredictions.map(mapSuggestion);
}
