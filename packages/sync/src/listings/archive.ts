import { listing } from "@dashseller/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { SyncContext } from "../context";

export type ArchiveListingOutcome = "archived" | "stale" | "not-found";

/**
 * Tombstone a listing by (channel, reference) with an explicit version
 * source per the clock rules — Shopify `products/delete` passes the
 * delivery's `providerEventAt`; eBay reconciliation passes the captured
 * response `Timestamp` (an observation version).
 *
 * The version guard makes tombstones totally ordered with updates: a
 * delete older than the stored clock is stale (the row was observed alive
 * AFTER the delete fired) and does nothing; once archived, the stored
 * tombstone version is what stops an older update from un-archiving.
 */
export async function archiveListing(
  ctx: SyncContext,
  params: {
    channelId: string;
    reference: string;
    /** Provider event clock (Shopify) or observation clock (eBay). */
    tombstoneVersion: Date;
  }
): Promise<ArchiveListingOutcome> {
  const updated = await ctx.db
    .update(listing)
    .set({
      archived: true,
      archivedAt: sql`now()`,
      sourceVersionAt: params.tombstoneVersion,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(listing.channelId, params.channelId),
        eq(listing.reference, params.reference),
        // UTC ISO string + cast, NOT a raw Date param: the driver would
        // serialize a Date host-local while the column stores UTC-naive,
        // shifting the staleness comparison by the host's UTC offset.
        sql`(${listing.sourceVersionAt} IS NULL OR ${listing.sourceVersionAt} <= ${params.tombstoneVersion.toISOString()}::timestamp)`
      )
    )
    .returning({ id: listing.id });

  if (updated.length > 0) {
    ctx.logger.info("Listing archived", {
      channelId: params.channelId,
      reference: params.reference,
      tombstoneVersion: params.tombstoneVersion.toISOString(),
    });
    return "archived";
  }

  const [existing] = await ctx.db
    .select({ id: listing.id })
    .from(listing)
    .where(
      and(
        eq(listing.channelId, params.channelId),
        eq(listing.reference, params.reference)
      )
    )
    .limit(1);
  return existing ? "stale" : "not-found";
}
