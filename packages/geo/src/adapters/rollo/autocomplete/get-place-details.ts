import type { PlaceDetails, RolloConfig } from "../../../types";
import { RolloError } from "../errors";
import { rolloFetch } from "../http";
import {
  type LegacyPlaceDetailsResult,
  mapPlaceDetails,
} from "./mapper/map-place-details";

/**
 * Fields requested from the legacy Place Details endpoint. Pulled
 * by name (cheaper and more stable than `ALL`); covers everything
 * `mapPlaceDetails` reads.
 */
const PLACE_DETAILS_FIELDS = [
  "address_components",
  "formatted_address",
  "geometry/location",
  "place_id",
].join(",");

interface LegacyPlaceDetailsResponse {
  error_message?: string;
  result?: LegacyPlaceDetailsResult;
  status: string;
}

export async function getPlaceDetails(
  config: RolloConfig,
  placeId: string,
  sessionToken?: string
): Promise<PlaceDetails> {
  const query: Record<string, string> = {
    fields: PLACE_DETAILS_FIELDS,
    language: config.language ?? "en",
    placeid: placeId,
  };
  if (sessionToken) {
    query.sessiontoken = sessionToken;
  }

  const response = await rolloFetch<LegacyPlaceDetailsResponse>(config.apiKey, {
    path: "/details/json",
    query,
  });

  if (response.status !== "OK" || !response.result) {
    throw new RolloError({
      endpoint: "/details/json",
      googleErrorMessage:
        response.error_message ?? `No result for placeId ${placeId}`,
      googleStatus: response.status,
      httpStatus: 200,
    });
  }

  return mapPlaceDetails(response.result);
}
