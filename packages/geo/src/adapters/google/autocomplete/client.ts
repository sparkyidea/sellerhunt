import type {
  AutocompleteProvider,
  GoogleGeoConfig,
  PlaceDetails,
  Suggestion,
  SuggestOptions,
} from "../../../types";
import type { Autocomplete } from "../../base";
import { getPlaceDetails } from "./get-place-details";
import { suggest } from "./suggest";

export class GoogleAutocomplete implements Autocomplete {
  private readonly config: GoogleGeoConfig;

  constructor(config: GoogleGeoConfig) {
    if (!config.apiKey) {
      throw new Error(
        "GoogleAutocomplete requires apiKey (Google Maps Platform key)"
      );
    }
    this.config = config;
  }

  getProviderId(): AutocompleteProvider {
    return "google";
  }

  suggest(
    query: string,
    sessionToken: string,
    options: SuggestOptions
  ): Promise<Suggestion[]> {
    return suggest(this.config, query, sessionToken, options);
  }

  getPlaceDetails(
    placeId: string,
    sessionToken?: string
  ): Promise<PlaceDetails> {
    return getPlaceDetails(this.config, placeId, sessionToken);
  }
}
