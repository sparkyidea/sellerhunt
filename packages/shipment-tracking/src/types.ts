/**
 * Public types for `@dashseller/shipment-tracking`. Consumers import from
 * `@dashseller/shipment-tracking/types`. The contract interface lives in
 * `adapters/base.ts` and is re-exported here so this file is the single
 * import surface for callers.
 */
export type { TrackingClient } from "./adapters/base";

/**
 * Shippo-aligned tracking lifecycle status.
 *
 * Mirrors the persisted tracking status enum.
 */
export type TrackingStatus =
  | "pre_transit"
  | "transit"
  | "delivered"
  | "returned"
  | "failure"
  | "unknown";

/**
 * Shippo-aligned tracking substatus. Each substatus belongs to exactly one
 * parent status; we don't enforce that at the type level, only by convention.
 *
 * Mirrors the persisted tracking substatus enum.
 */
export type TrackingSubstatus =
  | "information_received"
  | "address_issue"
  | "contact_carrier"
  | "delayed"
  | "delivery_attempted"
  | "delivery_rescheduled"
  | "delivery_scheduled"
  | "location_inaccessible"
  | "notice_left"
  | "out_for_delivery"
  | "package_accepted"
  | "package_arrived"
  | "package_damaged"
  | "package_departed"
  | "package_forwarded"
  | "package_held"
  | "package_processed"
  | "package_processing"
  | "pickup_available"
  | "reschedule_delivery"
  | "delivered"
  | "return_to_sender"
  | "package_unclaimed"
  | "package_undeliverable"
  | "package_disposed"
  | "package_lost"
  | "other";

/**
 * Tracking provider — internal package discriminator. Not persisted to
 * dataview-exposed columns; trigger run logs are the operational source of
 * truth for which provider produced a given tracking row.
 */
export type TrackingProvider = "package-tracker";

/**
 * Adapter output for one tracking lookup. Field names match the `tracking`
 * table columns 1-to-1 so callers can spread directly into a drizzle insert.
 *
 * The `history` array is the per-event log. The repository layer inserts
 * the tracking row first, then bulk-inserts these events keyed by
 * `reference` with `onConflictDoNothing` — re-polls produce the same
 * reference hashes and become no-ops for already-seen events.
 */
export interface Tracking {
  eta: Date | null;
  history: TrackingEvent[];
  metadata: string | null;
  originalEta: Date | null;
  /**
   * Which adapter served this tracking — the *tracking source*, not the
   * shipping carrier. Today `"package-tracker"`. Future direct
   * integrations (UPS, USPS, DHL, FedEx, Shippo) would each get their
   * own provider slug. The shipping carrier lives on `shipment.carrier`.
   */
  provider: string;
  serviceLevelName: string | null;
  serviceLevelToken: string | null;
  status: TrackingStatus;
  trackingNumber: string;
}

/**
 * One carrier scan. Field names match the `tracking_event` table columns
 * 1-to-1.
 */
export interface TrackingEvent {
  /**
   * Raw upstream location string verbatim ("ESCONDIDO, CA 92026",
   * "NEW YORK NY DISTRIBUTION CENTER"), null when the upstream didn't
   * send one (e.g. synthesized in-transit events). Persisted as
   * `tracking_event.location` so the write-time geo resolver has the
   * original signal — the structured `location*` columns are a lossy
   * projection.
   */
  location: string | null;
  locationCity: string | null;
  locationCountry: string | null;
  locationState: string | null;
  locationZip: string | null;
  reference: string;
  status: TrackingStatus;
  statusDate: Date;
  statusDetails: string | null;
  substatus: TrackingSubstatus | null;
}

export interface TrackingInput {
  /**
   * Optional carrier hint. The current provider auto-detects, so this is
   * unused today; preserved on the unified contract for future providers
   * that benefit from disambiguation.
   */
  carrierHint?: string;
  trackingNumber: string;
}

export type ProviderConfig = PackageTrackerConfig;

export interface PackageTrackerConfig {
  /**
   * Bearer token captured from the Package Tracker iOS app. Rides as
   * `Authorization: Bearer <token>` against the Ship24 mobile endpoint.
   */
  credential: string;
  provider: "package-tracker";
}
