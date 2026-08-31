/**
 * Scheduled task: find non-terminal tracks within the 60-day age cutoff
 * and dispatch them to the reusable `pollTrackings` task. The actual
 * upstream calls and upserts live in `poll-trackings` — this task is
 * just the candidate-selection scheduler.
 *
 * The schedule is attached in the Trigger.dev dashboard. Suggested cadence
 * is 30 minutes — fast enough that customers see "out for delivery"
 * → "delivered" within a single window, conservative enough that we're not
 * hammering Package Tracker. The 60-day age cutoff stops indefinite polling
 * for stuck/abandoned shipments.
 */
import { db } from "@dashseller/db";
import { tracking } from "@dashseller/db/schema";
import { logger, schedules } from "@trigger.dev/sdk/v3";
import { and, asc, gt, notInArray } from "drizzle-orm";
import { pollTrackings } from "./poll-trackings";

const ABANDON_AFTER_DAYS = 60;
const BATCH_SIZE = 500;
const TERMINAL_STATUSES = ["delivered", "returned", "failure"] as const;

export const pollTracking = schedules.task({
  id: "poll-tracking",
  maxDuration: 600,
  retry: {
    factor: 1,
    maxAttempts: 1,
    maxTimeoutInMs: 5000,
    minTimeoutInMs: 1000,
  },
  run: async () => {
    const cutoff = new Date(
      Date.now() - ABANDON_AFTER_DAYS * 24 * 60 * 60 * 1000
    );

    // Filter on `updatedAt`, not `createdAt`: tracking rows are reused
    // when a number is reassigned to a new shipment (the
    // `(organizationId, trackingNumber)` conflict path in upsert-shipments and
    // shipment.create), and `updatedAt` auto-bumps on every drizzle
    // update via `$onUpdate`. Using `createdAt` would silently exclude
    // re-linked rows whose original creation predates the cutoff.
    const candidates = await db
      .select({ trackingNumber: tracking.trackingNumber })
      .from(tracking)
      .where(
        and(
          notInArray(tracking.status, [...TERMINAL_STATUSES]),
          gt(tracking.updatedAt, cutoff)
        )
      )
      .orderBy(asc(tracking.updatedAt))
      .limit(BATCH_SIZE);

    if (candidates.length === 0) {
      logger.info("No tracking rows to poll");
      return null;
    }

    const trackingNumbers = candidates.map((c) => c.trackingNumber);
    logger.info("Found candidates to poll", {
      count: trackingNumbers.length,
      sample: trackingNumbers.slice(0, 5),
    });

    const result = await pollTrackings.triggerAndWait(
      { trackingNumbers },
      { region: "local" }
    );

    if (!result.ok) {
      throw new Error(`pollTrackings child run failed: ${result.error}`);
    }

    return result.output;
  },
});
