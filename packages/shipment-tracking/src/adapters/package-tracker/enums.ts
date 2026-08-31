import type { TrackingStatus, TrackingSubstatus } from "../../types";

export interface MappedStatus {
  status: TrackingStatus;
  substatus: TrackingSubstatus | null;
}

/**
 * Map Ship24's `statusMilestone` vocabulary onto Shippo-aligned status +
 * substatus. The milestone set is documented at
 * https://docs.ship24.com/tracking-status-codes — anything we haven't seen
 * falls through to `unknown / other`.
 *
 * Ship24 doesn't model returns as a top-level milestone — a returned
 * shipment shows `delivered` at the return destination. Callers that need
 * to distinguish returns must inspect the event stream separately.
 */
export function convertPackageTrackerMilestone(
  raw: string | null
): MappedStatus {
  switch (raw) {
    case "pending":
      return { status: "unknown", substatus: "other" };

    case "info_received":
      return { status: "pre_transit", substatus: "information_received" };

    case "in_transit":
      return { status: "transit", substatus: null };

    case "out_for_delivery":
      return { status: "transit", substatus: "out_for_delivery" };

    case "failed_attempt":
      return { status: "transit", substatus: "delivery_attempted" };

    case "available_for_pickup":
      return { status: "transit", substatus: "pickup_available" };

    case "exception":
      return { status: "failure", substatus: "package_undeliverable" };

    case "delivered":
      return { status: "delivered", substatus: "delivered" };

    default:
      return { status: "unknown", substatus: "other" };
  }
}

/**
 * Per-event status refinement. Ship24's `event.statusMilestone` carries
 * the same vocabulary as the shipment, but most in-transit events get
 * bucketed as plain `in_transit` even when the free-text status describes
 * a more specific scan (arrived/departed/processed). We do a coarse
 * keyword sniff to tighten the substatus on those, ordered most-specific
 * first so "Out for Delivery" beats "Delivered" if both substrings
 * happen to co-occur.
 */
export function refinePackageTrackerEventSubstatus(
  milestone: string | null,
  statusText: string | null
): TrackingSubstatus | null {
  const milestoneMapped = convertPackageTrackerMilestone(milestone);

  // Trust the milestone outright when it already pins a specific
  // substatus — only the bare `in_transit` bucket needs refinement.
  if (milestoneMapped.substatus !== null && milestone !== "in_transit") {
    return milestoneMapped.substatus;
  }

  if (!statusText) {
    return milestoneMapped.substatus;
  }
  const text = statusText.toLowerCase();

  if (text.includes("out for delivery")) {
    return "out_for_delivery";
  }
  if (text.includes("delivery attempted") || text.includes("notice left")) {
    return "delivery_attempted";
  }
  if (text.includes("delivered")) {
    return "delivered";
  }
  if (text.includes("return")) {
    return "return_to_sender";
  }
  if (text.includes("lost")) {
    return "package_lost";
  }
  if (text.includes("damaged")) {
    return "package_damaged";
  }
  if (text.includes("undeliverable") || text.includes("exception")) {
    return "package_undeliverable";
  }
  if (text.includes("departed")) {
    return "package_departed";
  }
  if (text.includes("arrived")) {
    return "package_arrived";
  }
  if (text.includes("processed")) {
    return "package_processed";
  }
  if (text.includes("processing")) {
    return "package_processing";
  }
  if (text.includes("accepted")) {
    return "package_accepted";
  }

  return milestoneMapped.substatus;
}
