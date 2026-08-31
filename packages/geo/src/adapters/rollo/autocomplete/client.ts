import type {
  AutocompleteProvider,
  PlaceDetails,
  RolloConfig,
  Suggestion,
  SuggestOptions,
} from "../../../types";
import type { Autocomplete } from "../../base";
import { getPlaceDetails } from "./get-place-details";
import { suggest } from "./suggest";

export class RolloAutocomplete implements Autocomplete {
  private readonly config: RolloConfig;

  constructor(config: RolloConfig) {
    if (!config.apiKey) {
      throw new Error("RolloAutocomplete requires apiKey (Rollo iOS-app key)");
    }
    this.config = config;
  }

  getProviderId(): AutocompleteProvider {
    return "rollo";
  }

  getPlaceDetails(
    placeId: string,
    sessionToken?: string
  ): Promise<PlaceDetails> {
    return getPlaceDetails(this.config, placeId, sessionToken);
  }

  suggest(
    query: string,
    sessionToken: string,
    options: SuggestOptions
  ): Promise<Suggestion[]> {
    return suggest(this.config, query, sessionToken, options);
  }
}
