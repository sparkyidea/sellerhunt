import type { CorrelationMethod } from "@dashseller/db/schema";
import type { ShippingFulfillment } from "@dashseller/marketplace/types";
import { normalizeTracking } from "@dashseller/shipment-tracking/utils";

export type { ShippingFulfillment } from "@dashseller/marketplace/types";

/**
 * The remote snapshot shape stored alongside outbox entries
 * to capture the state of the remote order and any matched fulfillment.
 */
export interface RemoteSnapshot {
  matchedFulfillment: ShippingFulfillment | null;
  orderStatus: {
    status: string;
    shipped: boolean;
    shippedAt: string | null;
    deliveredAt: string | null;
  };
  type: "ebayFulfillment";
}

/**
 * Resolve which remote fulfillment corresponds to this outbox push, in
 * priority order:
 *
 *   1. `client_reference` — the marketplace echoed our outbox.id back
 *      (Phase 2 wires this up per adapter; Phase 1 leaves the rung in
 *      place but no adapter populates `clientReferenceId` yet).
 *   2. `tracking_match`   — tracking equality, scoped implicitly to
 *      this order because callers pass only that order's fulfillments.
 *
 * Remote tracking is already canonical: every marketplace adapter
 * normalizes inside `mapFulfillment`, so `r.tracking` matches what
 * adapter-output consumers see everywhere. We still normalize
 * `localShipment.tracking` because the local row may have been written
 * directly from user input via TRPC, bypassing the adapter.
 *
 * Returns the matched fulfillment alongside the method used so callers
 * can label `sync_outbox.correlation_method` correctly. Null when no
 * rung fires.
 *
 * Rule: FUL-005 — ladder order is load-bearing; recording which rung won
 * is what makes silent adapter degradation queryable. FUL-003 for the
 * normalized, non-empty tracking comparison. FUL-006 — no content hash.
 */
export function findMatchingFulfillment(
  outboxRow: { id: string },
  localShipment: { tracking: string | null } | null,
  remoteFulfillments: ShippingFulfillment[]
): { match: ShippingFulfillment; method: CorrelationMethod } | null {
  const byClientRef = remoteFulfillments.find(
    (r) => r.clientReferenceId != null && r.clientReferenceId === outboxRow.id
  );
  if (byClientRef) {
    return { match: byClientRef, method: "client_reference" };
  }

  if (localShipment) {
    const lt = normalizeTracking(localShipment.tracking);
    if (lt !== null) {
      const byTracking = remoteFulfillments.find((r) => r.tracking === lt);
      if (byTracking) {
        return { match: byTracking, method: "tracking_match" };
      }
    }
  }

  return null;
}

/**
 * Builds a remote snapshot object capturing the current state of
 * the remote order and any matched fulfillment. This snapshot is
 * stored with outbox entries for audit and idempotency purposes.
 */
export function buildShipmentRemoteSnapshot(
  orderStatus: {
    status: string;
    shipped: boolean;
    shippedAt: string | null;
    deliveredAt: string | null;
  },
  matchedFulfillment: ShippingFulfillment | null
): RemoteSnapshot {
  return {
    type: "ebayFulfillment",
    orderStatus: {
      status: orderStatus.status,
      shipped: orderStatus.shipped,
      shippedAt: orderStatus.shippedAt,
      deliveredAt: orderStatus.deliveredAt,
    },
    matchedFulfillment,
  };
}
