import type {
  Address,
  GeocoderProvider,
  GeocodingResult,
  RolloConfig,
} from "../../../types";
import type { Geocoder } from "../../base";
import { geocode } from "./geocode";

export class RolloGeocoder implements Geocoder {
  private readonly config: RolloConfig;

  constructor(config: RolloConfig) {
    if (!config.apiKey) {
      throw new Error("RolloGeocoder requires apiKey (Rollo iOS-app key)");
    }
    this.config = config;
  }

  /**
   * Forward-geocode via Text Search → Place Details, with strict
   * exact-match verification: if the top match's normalized
   * components don't agree with the input's zipcode (and state, when
   * both are present), returns `null` rather than silently persisting
   * potentially wrong coordinates.
   */
  geocode(address: Partial<Address>): Promise<GeocodingResult | null> {
    return geocode(this.config, address);
  }

  getProviderId(): GeocoderProvider {
    return "rollo";
  }
}
