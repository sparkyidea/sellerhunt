import type { Address } from "../../../types";

/**
 * Confirms the upstream geocode hit landed in the same postal area
 * as the consumer's input. Returns `true` when the zipcode (and
 * state, when both sides provide it) match after normalization;
 * `false` otherwise.
 *
 * Why zipcode-only: ship-to lat/lng is used for map display, where
 * "pin somewhere in the right zip area" is the actual requirement.
 * Strict component matching (street, city, etc.) was rejecting
 * cases where Google's canonical address differed cosmetically
 * (`S` ↔ `South`, `St` ↔ `Street`, USPS postal town ↔ administrative
 * city) — same place, different naming. Zipcode anchors the
 * location to a small enough region for the map use case and
 * catches the actually-wrong cases where Google geocodes to a
 * different ZIP entirely.
 *
 * Normalization:
 *  - `zipcode`: for numeric US-style ZIPs, only the first 5 digits
 *    are compared (`94043-1351` ≡ `94043`); for alphanumeric postal
 *    codes (CA, UK, …), whitespace is stripped and uppercased.
 *  - `state`: uppercase compare on the ISO alpha-2 code (DB columns
 *    store alpha-2, Google's `short_name` returns alpha-2).
 *
 * Inputs without a zipcode are rejected — we need at least one
 * postal anchor to call any verification a yes. Provider responses
 * without a zipcode are likewise rejected for the same reason.
 */
export function verifyMatch(input: Partial<Address>, result: Address): boolean {
  if (!(input.zipcode && result.zipcode)) {
    return false;
  }
  if (normalizeZipcode(input.zipcode) !== normalizeZipcode(result.zipcode)) {
    return false;
  }
  if (
    input.state &&
    result.state &&
    normalizeCode(input.state) !== normalizeCode(result.state)
  ) {
    return false;
  }
  return true;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

const NUMERIC_ZIP_PREFIX = /^(\d{5})/;
const WHITESPACE = /\s+/g;

function normalizeZipcode(value: string): string {
  const trimmed = value.trim();
  const numericPrefix = trimmed.match(NUMERIC_ZIP_PREFIX);
  if (numericPrefix) {
    return numericPrefix[1] as string;
  }
  return trimmed.replace(WHITESPACE, "").toUpperCase();
}
