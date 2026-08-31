import type { Address, GeocodingResult, RolloConfig } from "../../../types";
import { getPlaceDetails } from "../autocomplete/get-place-details";
import { textSearch } from "./text-search";
import { verifyMatch } from "./verify-match";

/**
 * Forward geocode via the Rollo adapter.
 *
 * Rollo's API key is denied on Google's Geocoding API but
 * authorized for legacy Places Text Search + Place Details, so we
 * compose a two-call pipeline:
 *
 *   1. Text Search resolves the joined query string to a `placeId`
 *      (the top match).
 *   2. Place Details fetches the full structured address +
 *      coordinates for that `placeId`. Reuses the existing
 *      `rollo/autocomplete/get-place-details.ts` — no session
 *      token, since this is a standalone backend lookup, not part
 *      of an autocomplete UX session.
 *
 * Always-on strict verification: the result's structured `address`
 * is compared against the input's zipcode (and state when both are
 * present). If verification fails the geocode returns `null` rather
 * than silently persisting potentially wrong coordinates.
 *
 * Note on `address2`: unit designators (Apt, Suite, Trlr, #) are
 * actively excluded from the Text Search query. Real-world cases
 * like "834 E Broadway St, Trlr 1, Blair WI" return a wrong street
 * with the unit included; the same input without the unit returns
 * the correct one. Verification still uses the input's other fields,
 * so the omitted address2 doesn't compromise accuracy.
 */
export async function geocode(
  config: RolloConfig,
  input: Partial<Address>
): Promise<GeocodingResult | null> {
  const query = joinForTextSearch(input);
  if (!query) {
    return null;
  }

  const top = await textSearch(config, query);
  if (!top) {
    return null;
  }

  const details = await getPlaceDetails(config, top.placeId);

  if (!verifyMatch(input, details.address)) {
    return null;
  }

  return details;
}

function joinForTextSearch(input: Partial<Address>): string {
  // address2 deliberately excluded — see the Rollo wrong-street note
  // above. All other available components join in postal order.
  return [input.address1, input.city, input.state, input.zipcode, input.country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}
