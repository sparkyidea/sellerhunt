import type { TrackingStatus, TrackingSubstatus } from "../../tracking-status";

export const STATUS_BADGE_VARIANT = {
  pre_transit: "gray-subtle",
  transit: "blue-subtle",
  delivered: "green-subtle",
  returned: "orange-subtle",
  failure: "red-subtle",
  unknown: "gray-subtle",
} as const satisfies Record<TrackingStatus, string>;

export interface TrackingEvent {
  id: string;
  latitude: number | null;
  location: string | null;
  longitude: number | null;
  status: TrackingStatus | null;
  statusDate: Date;
  statusDetails: string | null;
  substatus: TrackingSubstatus | null;
}

// Matches the carrier scan format ("IRON RIVER, MI 49935") so the dispatch
// and delivered placeholder rows read as the same line item as real events.
function formatCityStateZip(parts: {
  city: string | null;
  state: string | null;
  zip: string | null;
}) {
  const stateZip = [parts.state, parts.zip].filter(Boolean).join(" ");
  return [parts.city, stateZip].filter(Boolean).join(", ");
}

export function formatShipFromShort(parts: {
  shipFromCity: string | null;
  shipFromState: string | null;
  shipFromZipcode: string | null;
}) {
  return formatCityStateZip({
    city: parts.shipFromCity,
    state: parts.shipFromState,
    zip: parts.shipFromZipcode,
  });
}

export function formatShipToShort(parts: {
  shipToCity: string | null;
  shipToState: string | null;
  shipToZipcode: string | null;
}) {
  return formatCityStateZip({
    city: parts.shipToCity,
    state: parts.shipToState,
    zip: parts.shipToZipcode,
  });
}

// Schema stores weight in ounces; render in pounds to match the Figma spec.
export function formatWeight(weight: string | null) {
  if (!weight) {
    return null;
  }
  const oz = Number(weight);
  if (!Number.isFinite(oz)) {
    return null;
  }
  return `${(oz / 16).toFixed(1)} lb`;
}

// Package dimensions are stored in inches.
export function formatDimensions(
  length: string | null,
  width: string | null,
  height: string | null
) {
  if (!(length && width && height)) {
    return null;
  }
  return `${length} × ${width} × ${height} in`;
}
