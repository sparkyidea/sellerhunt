import { tracking, trackingEvent } from "@dashseller/db/schema";
import type {
  Tracking,
  TrackingEvent,
} from "@dashseller/shipment-tracking/types";
import type { SyncContext } from "../context";
import {
  type ResolvedCoords,
  resolveEventCoords,
} from "./resolve-event-coords";

export interface UpsertTrackingInput {
  organizationId: string;
  shipmentId: string;
  tracking: Tracking;
}

export interface UpsertTrackingResult {
  insertedEvents: number;
  trackingId: string;
}

/**
 * Upsert one tracking lookup result.
 *
 * - The `tracking` row is upserted on `(organizationId, trackingNumber)` —
 *   re-polls update in place. `shipmentId` is required (tracking is a
 *   child of shipment in the schema) and re-set on conflict so callers
 *   always reflect the current linkage.
 * - Each event from `tracking.history` is resolved to lat/lng via the
 *   3-tier `resolveEventCoords` chain (zip → city+state → state),
 *   deduped within this call so events sharing a structured location
 *   fingerprint pay one round of lookups. Inserted with
 *   `ON CONFLICT (tracking_id, reference) DO NOTHING`, so already-seen
 *   events become no-ops and never re-resolve.
 *
 * Rule: FUL-009 — geo resolves here on the write path, never per read.
 * FUL-010 — `reference` is a deterministic hash, not an upstream event
 * id, which is what makes re-polls idempotent. The location fingerprint
 * here is a dedup key within one tracking, not a cross-system identity
 * (that would be FUL-006).
 */
export async function upsertTracking(
  ctx: SyncContext,
  input: UpsertTrackingInput
): Promise<UpsertTrackingResult> {
  const { history, ...trackingFields } = input.tracking;

  const [row] = await ctx.db
    .insert(tracking)
    .values({
      organizationId: input.organizationId,
      shipmentId: input.shipmentId,
      ...trackingFields,
    })
    .onConflictDoUpdate({
      target: [tracking.organizationId, tracking.trackingNumber],
      set: {
        ...trackingFields,
        shipmentId: input.shipmentId,
        updatedAt: new Date(),
      },
    })
    .returning({ id: tracking.id });

  if (!row) {
    throw new Error(
      `Failed to upsert tracking for ${input.tracking.provider}/${input.tracking.trackingNumber}`
    );
  }

  if (history.length === 0) {
    return { trackingId: row.id, insertedEvents: 0 };
  }

  const eventsWithCoords = await resolveHistoryCoords(ctx, history);

  const inserted = await ctx.db
    .insert(trackingEvent)
    .values(
      eventsWithCoords.map((event) => ({
        organizationId: input.organizationId,
        trackingId: row.id,
        ...event,
      }))
    )
    .onConflictDoNothing({
      target: [trackingEvent.trackingId, trackingEvent.reference],
    })
    .returning({ id: trackingEvent.id });

  return { trackingId: row.id, insertedEvents: inserted.length };
}

/**
 * Resolve coords for every event, deduping by the structured
 * location fingerprint so repeated locations (common: consecutive
 * "DEPARTED ESCONDIDO CA 92026" scans) only run one round of DB
 * lookups within this upsert call.
 */
async function resolveHistoryCoords(
  ctx: SyncContext,
  history: readonly TrackingEvent[]
): Promise<(TrackingEvent & ResolvedCoords)[]> {
  const keyToCoords = new Map<string, Promise<ResolvedCoords>>();
  const keyOf = (e: TrackingEvent): string =>
    [
      (e.locationCountry ?? "US").toUpperCase(),
      e.locationZip ?? "",
      (e.locationState ?? "").toUpperCase(),
      e.locationCity ?? "",
    ].join("|");

  for (const event of history) {
    const key = keyOf(event);
    if (!keyToCoords.has(key)) {
      keyToCoords.set(key, resolveEventCoords(ctx, event));
    }
  }

  await Promise.all(keyToCoords.values());

  return Promise.all(
    history.map(async (event) => {
      const coords = await keyToCoords.get(keyOf(event));
      return { ...event, ...(coords ?? { latitude: null, longitude: null }) };
    })
  );
}
