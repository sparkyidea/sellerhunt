import { createHash } from "node:crypto";

/**
 * Build a stable, opaque event id for sources whose carrier-issued id isn't
 * stable across polls (or doesn't exist at all). Same input → same hash →
 * upsert-safe via the `tracking_event (trackingId, reference)` unique index.
 *
 * The hash includes the tracking number so the same scan time + status on
 * different shipments still produce distinct references.
 */
export function synthesizeEventReference(parts: {
  trackingNumber: string;
  statusDate: Date;
  statusDetails: string | null;
  carrier: string | null;
}): string {
  return createHash("sha256")
    .update(parts.trackingNumber)
    .update("\0")
    .update(parts.statusDate.toISOString())
    .update("\0")
    .update(parts.statusDetails ?? "")
    .update("\0")
    .update(parts.carrier ?? "")
    .digest("hex");
}
