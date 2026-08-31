import type {
  Address,
  GeocoderProvider,
  GeocodingResult,
  GoogleGeoConfig,
} from "../../../types";
import type { Geocoder } from "../../base";
import { geocode } from "./geocode";

export class GoogleGeocoder implements Geocoder {
  private readonly config: GoogleGeoConfig;

  constructor(config: GoogleGeoConfig) {
    if (!config.apiKey) {
      throw new Error(
        "GoogleGeocoder requires apiKey (Google Maps Platform key)"
      );
    }
    this.config = config;
  }

  /**
   * Forward-geocode through Google's Geocoding API. Google's own
   * ranker is trusted to pick the best match — no post-hoc
   * verification.
   */
  geocode(address: Partial<Address>): Promise<GeocodingResult | null> {
    return geocode(this.config, address);
  }

  getProviderId(): GeocoderProvider {
    return "google";
  }
}
