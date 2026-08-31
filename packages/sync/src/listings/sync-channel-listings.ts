import { channel, listing } from "@dashseller/db/schema";
import type { ApiClient, Listing } from "@dashseller/marketplace/types";
import { and, eq, sql } from "drizzle-orm";
import type { SyncContext } from "../context";
import { getDomainWatermark, recordDomainRun } from "../orders/watermark";
import { openSyncWindow } from "../sync-window";
import { upsertListings } from "./upsert-listings";

export interface SyncChannelListingsResult {
  archived: number;
  errors: string[];
  listingsUpserted: number;
  staleRejected: number;
  success: boolean;
  totalPulled: number;
}

/**
 * Run marker from the DATABASE clock, kept as opaque text. It must never
 * become a JS Date: the driver parses timestamp-without-tz as host-local
 * time while drizzle serializes Dates as UTC, so a round-trip shifts the
 * marker by the host's UTC offset — both sides of the archive predicate
 * must come from the same DB clock, byte-for-byte.
 */
async function captureRunMarker(ctx: SyncContext): Promise<string> {
  const result = await ctx.db.execute<{ now: string }>(
    sql`SELECT now()::text AS now`
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("SELECT now() returned no rows");
  }
  return row.now;
}

/** Newest provider/observation version seen in this run's pages. */
function maxSourceVersion(
  listings: Listing[],
  current: Date | null
): Date | null {
  let max = current;
  for (const item of listings) {
    if (item.sourceVersionAt && (!max || item.sourceVersionAt > max)) {
      max = item.sourceVersionAt;
    }
  }
  return max;
}

/**
 * Windowed listings pull for one channel, with full reconciliation.
 *
 * Incremental runs (watermark present, no forceRefresh) just upsert.
 * FULL runs additionally archive rows the marketplace no longer returns:
 * every upserted row is stamped `last_observed_at = now()` (PG clock), a
 * run marker is captured from the SAME clock before the first page, and —
 * only after EVERY page succeeded — rows still carrying an observation
 * older than the run marker are archived. A failed page archives nothing.
 *
 * Archived rows get `source_version_at` advanced to the newest observation
 * version seen in the run (eBay: response Timestamps — observation clocks
 * comparable only to other eBay observations), so a stray in-flight update
 * from BEFORE the reconciliation cannot un-archive them.
 */
export async function syncChannelListings(
  ctx: SyncContext,
  params: {
    apiClient: ApiClient;
    channelId: string;
    forceRefresh?: boolean;
  }
): Promise<SyncChannelListingsResult> {
  const { apiClient, channelId, forceRefresh = false } = params;

  const [channelRow] = await ctx.db
    .select({ organizationId: channel.organizationId })
    .from(channel)
    .where(eq(channel.id, channelId))
    .limit(1);
  if (!channelRow) {
    throw new Error(`Channel not found: ${channelId}`);
  }
  const { organizationId } = channelRow;

  const syncedAt = await getDomainWatermark(ctx, channelId, "listings");
  const window = openSyncWindow({ clock: ctx.clock, forceRefresh, syncedAt });
  const isFullPull = window.since === undefined;
  const runMarker = await captureRunMarker(ctx);

  const errors: string[] = [];
  let listingsUpserted = 0;
  let staleRejected = 0;
  let totalPulled = 0;
  let archived = 0;
  let observationVersion: Date | null = null;
  let cursor: string | undefined;

  try {
    do {
      // Fallback seed cutoff BOUNDS for listings without a provider
      // observation clock. Lower captured BEFORE the fetch, upper AFTER:
      // an order placed while the page is in flight classifies as
      // post-baseline and a restore during it as pre-baseline — both
      // undersell, never oversell.
      const observedAt = ctx.clock.now();
      const page = await apiClient.getListings({
        cursor,
        modifiedSince: window.since,
      });
      const observedAtUpper = ctx.clock.now();
      totalPulled += page.data.length;
      if (page.data.length > 0) {
        observationVersion = maxSourceVersion(page.data, observationVersion);
        const result = await upsertListings(ctx, {
          channelId,
          listings: page.data,
          observedAt,
          observedAtUpper,
        });
        listingsUpserted += result.newListings + result.updatedListings;
        staleRejected += result.staleRejected;
        for (const error of result.errors) {
          errors.push(`${error.reference}: ${error.error}`);
        }
      }
      cursor = page.cursor ?? undefined;
    } while (cursor);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  // Archive pass: FULL runs only, and only when every page landed — a
  // partial pull proves nothing about rows it never reached.
  if (isFullPull && errors.length === 0) {
    const archivedRows = await ctx.db
      .update(listing)
      .set({
        archived: true,
        archivedAt: sql`now()`,
        // The param is passed as a UTC ISO string + ::timestamp cast: a raw
        // Date param here would be serialized host-local by the driver while
        // drizzle stores the column UTC-naive — same clock-mixing hazard as
        // the run marker.
        ...(observationVersion
          ? {
              sourceVersionAt: sql`GREATEST(COALESCE(${listing.sourceVersionAt}, ${observationVersion.toISOString()}::timestamp), ${observationVersion.toISOString()}::timestamp)`,
            }
          : {}),
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(listing.channelId, channelId),
          eq(listing.archived, false),
          // PG-clock predicate; NULL last_observed_at never matches — a row
          // sync never observed (e.g. locally created) is not archivable.
          sql`${listing.lastObservedAt} <= ${runMarker}::timestamp`
        )
      )
      .returning({ id: listing.id });
    archived = archivedRows.length;
    if (archived > 0) {
      ctx.logger.info("Full reconciliation archived unseen listings", {
        channelId,
        archived,
      });
    }
  }

  const success = errors.length === 0;
  await recordDomainRun(ctx, {
    channelId,
    domain: "listings",
    organizationId,
    ranAt: ctx.clock.now(),
    success,
    conflicts: 0,
    watermark: window.until,
    error: success ? null : errors.slice(0, 3).join("; "),
  });

  return {
    success,
    totalPulled,
    listingsUpserted,
    staleRejected,
    archived,
    errors,
  };
}
