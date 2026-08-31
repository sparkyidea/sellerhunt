/**
 * Reusable tracking-poll workflow. Accepts a list of tracking numbers,
 * looks up the matching `track` rows, calls Package Tracker (Ship24)
 * for each, and upserts results.
 *
 * Used by:
 *   - `poll-tracking` cron — passes the batch of due-for-poll tracks.
 *   - Manual triggers in trigger.dev's UI — paste a payload like
 *       { "trackingNumbers": ["9402266365018300668067"] }
 *     to debug a specific tracking number end-to-end.
 *   - Future ad-hoc producers (e.g. user clicks "refresh tracking" in the
 *     app, tRPC fires this with the single number).
 *
 * Tracking numbers without a corresponding `track` row are skipped with a
 * warning. `tracking` rows are created exclusively at shipment creation
 * time (marketplace import + tRPC createShipment), so a missing tracking
 * here means no shipment owns the number yet. Use the
 * `sandbox/package-tracker` scripts for ad-hoc number testing.
 */
import { db } from "@dashseller/db";
import { tracking } from "@dashseller/db/schema";
import { env } from "@dashseller/env/trigger-sync";
import { createTrackingClient } from "@dashseller/shipment-tracking";
import { upsertTracking } from "@dashseller/sync";
import { logger, task } from "@trigger.dev/sdk/v3";
import { and, eq, inArray } from "drizzle-orm";
import { getSyncContext } from "../context";

const TERMINAL_STATUSES = ["delivered", "returned", "failure"] as const;

type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

function isTerminal(status: string): status is TerminalStatus {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export interface PollTrackingsPayload {
  /**
   * Optional organization scope. When set, only matches `tracking` rows
   * owned by this organization. Cron leaves it unset to poll across all
   * organizations in one batch.
   */
  organizationId?: string;
  /** Tracking numbers to poll. Required; empty list returns immediately. */
  trackingNumbers: string[];
}

export interface PollTrackingsResult {
  /** Polls that threw — see logs for per-track reasons. */
  errored: number;
  /** Polls that succeeded. */
  polled: number;
  /** Numbers without a track row (no owning shipment) that were skipped. */
  skipped: number;
  /** Polls whose result is now terminal (delivered/returned/failure). */
  terminalNow: number;
  /** Total inputs received. */
  total: number;
}

export const pollTrackings = task({
  id: "poll-trackings",
  maxDuration: 600,
  retry: {
    factor: 1,
    maxAttempts: 1,
    maxTimeoutInMs: 5000,
    minTimeoutInMs: 1000,
  },
  run: async (payload: PollTrackingsPayload): Promise<PollTrackingsResult> => {
    const { trackingNumbers, organizationId } = payload;

    if (trackingNumbers.length === 0) {
      logger.info("No tracking numbers in payload");
      return {
        errored: 0,
        polled: 0,
        skipped: 0,
        terminalNow: 0,
        total: 0,
      };
    }

    logger.info("Looking up track rows", {
      count: trackingNumbers.length,
      organizationIdScoped: Boolean(organizationId),
    });

    const lookupWhere = organizationId
      ? and(
          eq(tracking.organizationId, organizationId),
          inArray(tracking.trackingNumber, trackingNumbers)
        )
      : inArray(tracking.trackingNumber, trackingNumbers);

    // Cron runs leave `organizationId` unset, and the schema allows the same
    // `trackingNumber` across organizations (unique index is on
    // `(organizationId, trackingNumber)`). Keep every matching row so each
    // owning shipment gets polled and upserted.
    const candidates = await db
      .select({
        id: tracking.id,
        shipmentId: tracking.shipmentId,
        trackingNumber: tracking.trackingNumber,
        organizationId: tracking.organizationId,
      })
      .from(tracking)
      .where(lookupWhere);

    const foundNumbers = new Set(candidates.map((row) => row.trackingNumber));
    const missing = trackingNumbers.filter((n) => !foundNumbers.has(n));

    if (missing.length > 0) {
      logger.warn("Tracking numbers without tracking rows — skipping", {
        count: missing.length,
        sample: missing.slice(0, 10),
        hint: "tracking rows are created at shipment creation time; this number has no owning shipment",
      });
    }

    if (candidates.length === 0) {
      logger.info("No candidates to poll after lookup");
      return {
        errored: 0,
        polled: 0,
        skipped: missing.length,
        terminalNow: 0,
        total: trackingNumbers.length,
      };
    }

    const client = createTrackingClient({
      provider: "package-tracker",
      credential: env.PACKAGE_TRACKER_CREDENTIAL,
    });

    let polled = 0;
    let errored = 0;
    let terminalNow = 0;

    for (const candidate of candidates) {
      // logger.trace creates a span in trigger.dev's UI — each tracking
      // gets its own collapsible entry with its child logs nested
      // underneath.
      await logger.trace(
        `poll-tracking ${candidate.trackingNumber}`,
        async () => {
          try {
            const result = await client.track({
              trackingNumber: candidate.trackingNumber,
            });
            const upsertResult = await upsertTracking(getSyncContext(), {
              shipmentId: candidate.shipmentId,
              tracking: result,
              organizationId: candidate.organizationId,
            });
            polled++;
            const terminal = isTerminal(result.status);
            if (terminal) {
              terminalNow++;
            }
            logger.info("Polled tracking", {
              provider: result.provider,
              newEvents: upsertResult.insertedEvents,
              status: result.status,
              terminal,
              trackingNumber: candidate.trackingNumber,
            });
          } catch (err) {
            errored++;
            logger.warn("Failed to poll tracking", {
              error: err instanceof Error ? err.message : String(err),
              trackingId: candidate.id,
              trackingNumber: candidate.trackingNumber,
            });
          }
        }
      );
    }

    const summary: PollTrackingsResult = {
      errored,
      polled,
      skipped: missing.length,
      terminalNow,
      total: trackingNumbers.length,
    };
    logger.info("Poll complete", { ...summary });
    return summary;
  },
});
