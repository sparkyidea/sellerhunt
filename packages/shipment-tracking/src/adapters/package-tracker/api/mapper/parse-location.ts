/**
 * Ship24 returns `event.location` as a single free-text string. We only
 * extract structured columns from the comma-delimited shapes:
 *
 *   "ELLWOOD CITY, PA 16117" — city, state ZIP
 *   "NEW YORK, NY, US"       — city, state, country (UPS)
 *
 * Anything else (facility names like "PITTSBURGH PA DISTRIBUTION CENTER",
 * bare tokens, null) leaves city/state/zip/country null. The raw string
 * round-trips on `tracking_event.location` and the write-time geo resolver
 * geocodes it directly when it needs coords.
 */

const US_ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/;
const TWO_LETTER_CODE = /^[A-Z]{2}$/;
const WHITESPACE_SPLIT = /\s+/;

export interface ParsedLocation {
  city: string | null;
  country: string | null;
  state: string | null;
  zip: string | null;
}

const EMPTY: ParsedLocation = {
  city: null,
  state: null,
  zip: null,
  country: null,
};

function parseCityStateCountry(parts: string[]): ParsedLocation {
  const [city, state, country] = parts;
  return {
    city: city ?? null,
    state: state && TWO_LETTER_CODE.test(state) ? state : (state ?? null),
    zip: null,
    country: country && TWO_LETTER_CODE.test(country) ? country : null,
  };
}

function parseCityStateZip(parts: string[]): ParsedLocation {
  const [city, tail] = parts;
  if (!(city && tail)) {
    return EMPTY;
  }
  const [state, zip] = tail.split(WHITESPACE_SPLIT);
  return {
    city,
    state: state && TWO_LETTER_CODE.test(state) ? state : null,
    zip: zip && US_ZIP_PATTERN.test(zip) ? zip : null,
    country: null,
  };
}

export function parsePackageTrackerLocation(
  raw: string | null
): ParsedLocation {
  if (!raw) {
    return EMPTY;
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length >= 3) {
    return parseCityStateCountry(parts);
  }
  if (parts.length === 2) {
    return parseCityStateZip(parts);
  }
  return EMPTY;
}
