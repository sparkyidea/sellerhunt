import type { Tracking, TrackingInput, TrackingProvider } from "../types";

/**
 * Unified tracking client interface. Each provider adapter implements this
 * so downstream callers can stay provider-agnostic.
 */
export interface TrackingClient {
  getProviderId(): TrackingProvider;
  /**
   * Look up tracking events for a shipment. Output matches the `tracking`
   * table shape — field-for-field upsertable.
   */
  track(input: TrackingInput): Promise<Tracking>;
}
