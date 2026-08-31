import type { Address, GeocodingResult, GoogleGeoConfig } from "../../../types";
import { GoogleGeoError } from "../errors";
import { geocodingApiFetch } from "../http";
import { type GeocodingApiResponse, mapResult } from "./mapper/map-result";

export async function geocode(
  config: GoogleGeoConfig,
  input: Partial<Address>
): Promise<GeocodingResult | null> {
  const address = joinAddress(input);
  if (!address) {
    return null;
  }

  const response = await geocodingApiFetch<GeocodingApiResponse>(
    config.apiKey,
    {
      address,
      language: config.language ?? "en",
    }
  );

  if (response.status === "ZERO_RESULTS") {
    return null;
  }

  if (response.status !== "OK") {
    throw new GoogleGeoError({
      httpStatus: 200,
      googleStatus: response.status,
      googleErrorMessage: response.error_message ?? "Unknown geocoding error",
      endpoint: "/maps/api/geocode/json",
    });
  }

  const firstResult = response.results[0];
  if (!firstResult) {
    return null;
  }

  return mapResult(firstResult);
}

function joinAddress(input: Partial<Address>): string {
  // Google's parser handles unit designators fine — include address2
  // when present so building-level pins resolve correctly.
  return [
    input.address1,
    input.address2,
    input.city,
    input.state,
    input.zipcode,
    input.country,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}
