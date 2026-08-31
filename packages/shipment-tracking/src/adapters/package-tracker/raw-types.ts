/**
 * Raw response shapes for the Ship24 mobile tracking API
 * (`https://api.ship24.com/public/v1/trackers/track`).
 *
 * The body shape is documented at
 * https://docs.ship24.com/tracking-results — the mobile endpoint returns
 * the same envelope. Fields are permissive (`string | null`, optional)
 * because the upstream extends them without warning; the mapper validates
 * what it actually reads.
 */

export interface PackageTrackerTracker {
  trackerId: string;
  trackingNumber: string;
}

export interface PackageTrackerDelivery {
  courierEstimatedDeliveryDate: string | null;
  estimatedDeliveryDate: string | null;
  service: string | null;
  signedBy: string | null;
}

export interface PackageTrackerShipment {
  delivery: PackageTrackerDelivery;
  /**
   * Coarse two-tier classification: `transit` | `delivery` | etc. Less
   * useful than `statusMilestone` for our mapping — kept on the type for
   * completeness.
   */
  statusCategory: string | null;
  /** Ship24-prefixed code, e.g. `"delivery_delivered"`. */
  statusCode: string | null;
  /**
   * Lifecycle bucket — the primary signal we map onto our top-level
   * status. Known values: `pending`, `info_received`, `in_transit`,
   * `out_for_delivery`, `failed_attempt`, `available_for_pickup`,
   * `exception`, `delivered`.
   */
  statusMilestone: string | null;
}

export interface PackageTrackerEvent {
  datetime: string | null;
  /**
   * Ship24-assigned event id. Stable across re-polls for the same physical
   * scan, so we use it verbatim as the upsert `reference`.
   */
  eventId: string;
  /** Free-text location string. Empty/null on synthesized transit events. */
  location: string | null;
  /** Free-text status sentence, e.g. "Delivered, Front Door/Porch". */
  status: string;
  statusCategory: string | null;
  statusCode: string | null;
  statusMilestone: string | null;
}

export interface PackageTrackerTracking {
  events: PackageTrackerEvent[];
  shipment: PackageTrackerShipment;
  tracker: PackageTrackerTracker;
}

export interface PackageTrackerTrackResponse {
  data: {
    trackings: PackageTrackerTracking[];
  };
}
