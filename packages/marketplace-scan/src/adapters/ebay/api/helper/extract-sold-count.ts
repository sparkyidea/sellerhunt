/**
 * Lifetime items-sold for an eBay listing.
 *
 * The dependable source is `listingProperties[].TOTAL_SOLD_QUANTITY` — a
 * top-level listing property present on every listing sampled (~42, single-item
 * and multi-variant alike; it emits `0` for an unsold listing), and equal to the
 * sum of every variant's `soldQuantity` on MSKU listings. `numberOfItemsSold` is
 * a cheap structured backstop in case eBay renames or moves the property on this
 * undocumented mobile API.
 *
 * Deliberately NOT used here: the `QTY_SOLD_TOTAL_SIGNAL` hotness signal. eBay
 * only attaches it to a subset of listings (<30% of samples), so reading it
 * first/only silently dropped the count for the majority — the bug this
 * replaced. When present it merely echoed `TOTAL_SOLD_QUANTITY`. The signal
 * reader lives on as `extractSignalCount`, still used for the watcher count in
 * `get-listing.ts`.
 */
import type {
  HotnessSignal,
  Listing as VlsListing,
} from "../../raw-types/listing-detail-response";

const TOTAL_SOLD_PROPERTY = "TOTAL_SOLD_QUANTITY";

export function extractItemSold(vls: VlsListing | undefined): number | null {
  const fromProperty = extractListingPropertyInt(vls, TOTAL_SOLD_PROPERTY);
  if (fromProperty !== null) {
    return fromProperty;
  }
  return extractUserRelationshipSold(vls);
}

/**
 * Read the `count` integer off a named hotness signal — used for the watcher
 * count (`WATCHERS_COUNT_TOTAL_SIGNAL`) in `get-listing.ts`.
 */
export function extractSignalCount(
  signals: HotnessSignal[],
  signalName: string
): number | null {
  const signal = signals.find((s) => s.signal === signalName);
  if (!signal) {
    return null;
  }
  for (const property of signal.properties ?? []) {
    if (property.propertyName !== "count") {
      continue;
    }
    for (const value of property.propertyValues ?? []) {
      if (typeof value.intValue === "number") {
        return value.intValue;
      }
      if (typeof value.longValue === "number") {
        return value.longValue;
      }
    }
  }
  return null;
}

function extractListingPropertyInt(
  vls: VlsListing | undefined,
  propertyName: string
): number | null {
  const prop = vls?.listingProperties?.find(
    (p) => p.propertyName === propertyName
  );
  for (const value of prop?.propertyValues ?? []) {
    if (typeof value.intValue === "number") {
      return value.intValue;
    }
  }
  return null;
}

function extractUserRelationshipSold(
  vls: VlsListing | undefined
): number | null {
  const sold =
    vls?.userToListingRelationshipSummary?.userToListingStatusMessages
      ?.propertyDetails?.numberOfItemsSold?.intValue;
  return typeof sold === "number" ? sold : null;
}
