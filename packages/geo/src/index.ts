import type { Autocomplete, Geocoder } from "./adapters/base";
import { GoogleAutocomplete } from "./adapters/google/autocomplete/client";
import { GoogleGeocoder } from "./adapters/google/geocoder/client";
import { RolloAutocomplete } from "./adapters/rollo/autocomplete/client";
import { RolloGeocoder } from "./adapters/rollo/geocoder/client";
import type {
  AutocompleteProvider,
  GeocoderProvider,
  GeoFactoryConfig,
} from "./types";

/**
 * Create a geocoding client for the requested provider.
 * Caller provides all credentials — no environment variables are read.
 * Types live at `@dashseller/geo/types`.
 *
 * @example
 * ```typescript
 * const geocoder = createGeocoder("rollo", { apiKey });
 * const result = await geocoder.geocode({
 *   address1: "1600 Amphitheatre Parkway",
 *   city: "Mountain View",
 *   state: "CA",
 *   zipcode: "94043",
 *   country: "US",
 * });
 * ```
 */
export function createGeocoder(
  provider: GeocoderProvider,
  config: GeoFactoryConfig
): Geocoder {
  switch (provider) {
    case "google":
      return new GoogleGeocoder(config);
    case "rollo":
      return new RolloGeocoder(config);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unsupported geocoder provider: ${String(exhaustive)}`);
    }
  }
}

/**
 * Create an autocomplete client for the requested provider.
 * Caller provides all credentials — no environment variables are read.
 * Types live at `@dashseller/geo/types`.
 *
 * @example
 * ```typescript
 * const autocomplete = createAutocomplete("google", { apiKey });
 * const suggestions = await autocomplete.suggest(
 *   "1600 amph",
 *   sessionToken,
 *   { countries: ["us"] },
 * );
 * ```
 */
export function createAutocomplete(
  provider: AutocompleteProvider,
  config: GeoFactoryConfig
): Autocomplete {
  switch (provider) {
    case "google":
      return new GoogleAutocomplete(config);
    case "rollo":
      return new RolloAutocomplete(config);
    default: {
      const exhaustive: never = provider;
      throw new Error(
        `Unsupported autocomplete provider: ${String(exhaustive)}`
      );
    }
  }
}
