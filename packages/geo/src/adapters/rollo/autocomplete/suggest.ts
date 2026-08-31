import type { RolloConfig, Suggestion, SuggestOptions } from "../../../types";
import { RolloError } from "../errors";
import { rolloFetch } from "../http";
import {
  type LegacyPlacePrediction,
  mapPrediction,
} from "./mapper/map-prediction";

interface LegacyAutocompleteResponse {
  error_message?: string;
  predictions: LegacyPlacePrediction[];
  status: string;
}

export async function suggest(
  config: RolloConfig,
  query: string,
  sessionToken: string,
  options: SuggestOptions
): Promise<Suggestion[]> {
  const params: Record<string, string> = {
    input: query,
    language: config.language ?? "en",
    sessiontoken: sessionToken,
    types: "address",
  };

  if (options.countries.length > 0) {
    params.components = options.countries
      .map((c) => `country:${c.toLowerCase()}`)
      .join("|");
  }

  if (options.locationBias) {
    params.location = `${options.locationBias.latitude},${options.locationBias.longitude}`;
    params.radius = "50000";
  }

  const response = await rolloFetch<LegacyAutocompleteResponse>(config.apiKey, {
    path: "/autocomplete/json",
    query: params,
  });

  if (response.status === "ZERO_RESULTS") {
    return [];
  }

  if (response.status !== "OK") {
    throw new RolloError({
      endpoint: "/autocomplete/json",
      googleErrorMessage:
        response.error_message ?? "Unknown autocomplete error",
      googleStatus: response.status,
      httpStatus: 200,
    });
  }

  return response.predictions.map(mapPrediction);
}
