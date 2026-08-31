import type { Address } from "../../../../types";

/**
 * Provider-agnostic shape for a Google address component.
 *
 * Both the Geocoding API (`address_components[]` with
 * `long_name`/`short_name`) and Places API New (`addressComponents[]`
 * with `longText`/`shortText`) feed into this mapper. Each call site
 * renames once before invoking — the mapper itself doesn't care.
 */
export interface NormalizedAddressComponent {
  longName: string;
  shortName: string;
  types: string[];
}

/**
 * Walk Google's address components and assemble a structured
 * `Address` whose field names match the warehouse schema 1-to-1.
 *
 * Every output field is nullable because Google omits components
 * that don't apply (rural lots have no street number, country-only
 * inputs return only `country`).
 *
 * Mapping rules:
 *  - `address1` = "{street_number} {route}" (or just route if no
 *    number; null if neither)
 *  - `address2` = subpremise (apt / suite) or null
 *  - `city` = locality (fallback postal_town, sublocality_level_1)
 *  - `state` = administrative_area_level_1.shortName
 *  - `zipcode` = postal_code
 *  - `country` = country.shortName (ISO 3166-1 alpha-2)
 */
export function mapAddressComponents(
  components: NormalizedAddressComponent[]
): Address {
  const find = (type: string): NormalizedAddressComponent | undefined =>
    components.find((c) => c.types.includes(type));

  const streetNumber = find("street_number")?.longName ?? null;
  const route = find("route")?.longName ?? null;
  const address1 = composeAddress1(streetNumber, route);

  const address2 = find("subpremise")?.longName ?? null;

  const city =
    find("locality")?.longName ??
    find("postal_town")?.longName ??
    find("sublocality_level_1")?.longName ??
    null;

  const state = find("administrative_area_level_1")?.shortName ?? null;
  const zipcode = find("postal_code")?.longName ?? null;
  const country = find("country")?.shortName ?? null;

  return { address1, address2, city, country, state, zipcode };
}

function composeAddress1(
  streetNumber: string | null,
  route: string | null
): string | null {
  if (streetNumber && route) {
    return `${streetNumber} ${route}`;
  }
  return route ?? streetNumber ?? null;
}
