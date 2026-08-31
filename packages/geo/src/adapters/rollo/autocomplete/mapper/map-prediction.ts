import type { Suggestion } from "../../../../types";

/**
 * Raw shape of a `predictions[]` entry from the legacy Google
 * Places `/autocomplete/json` endpoint.
 *
 * Only the fields this mapper consumes are typed — Google returns
 * more (terms, types, matched_substrings, etc.).
 */
export interface LegacyPlacePrediction {
  description: string;
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text?: string;
  };
}

export function mapPrediction(prediction: LegacyPlacePrediction): Suggestion {
  return {
    mainText: prediction.structured_formatting.main_text,
    placeId: prediction.place_id,
    secondaryText: prediction.structured_formatting.secondary_text ?? "",
  };
}
