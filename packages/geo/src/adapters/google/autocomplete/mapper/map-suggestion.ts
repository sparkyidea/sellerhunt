import type { Suggestion } from "../../../../types";

/**
 * Raw shape of a `suggestions[].placePrediction` entry from the
 * Places API (New) autocomplete endpoint.
 *
 * Note: the suggestions list may also contain `queryPrediction`
 * entries (free-text search predictions) — the caller filters
 * those out before reaching this mapper.
 */
export interface PlacePrediction {
  placeId: string;
  structuredFormat: {
    mainText: { text: string };
    secondaryText?: { text: string };
  };
}

export function mapSuggestion(prediction: PlacePrediction): Suggestion {
  return {
    mainText: prediction.structuredFormat.mainText.text,
    placeId: prediction.placeId,
    secondaryText: prediction.structuredFormat.secondaryText?.text ?? "",
  };
}
