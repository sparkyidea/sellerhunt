import { channel } from "@dashseller/db/schema";
import type { ApiClient } from "@dashseller/marketplace/types";
import { eq } from "drizzle-orm";
import type { SyncContext } from "../context";
import { openSyncWindow } from "../sync-window";
import type { OrdersUpsertPorts } from "./upsert-orders";
import { upsertOrders } from "./upsert-orders";
import { getDomainWatermark, recordDomainRun } from "./watermark";

export interface SyncChannelOrdersResult {
  errors: string[];
  /** True when the run was a listings-gate no-op (nothing pulled, no
   * sync-state row written — the orders watermark stays null). */
  gated: boolean;
  ordersUpserted: number;
  shipmentsUpserted: number;
  staleRejected: number;
  success: boolean;
  totalPulled: number;
}

/**
 * Windowed orders pull for one channel: open the sync window off the
 * orders-domain watermark, page through `getOrders`, upsert each page, and
 * record the run on `channel_sync_state` — advancing the watermark to the
 * window's captured upper bound only when every page succeeded.
 *
 * Strictly listings-first: while the listings watermark is null the pull is
 * a terminal no-op (`gated: true`) that records NO domain run, so the
 * orders watermark stays null and the listings processor's chained enqueue
 * runs the real first pull. Applies to forceRefresh too — operators
 * forceRefresh listings first.
 *
 * Rule: SYN-005 — listings before orders, so order lines can resolve
 * `listing_variant_id`. ORD-004 — the windowed pull is idempotent, which
 * is what makes overlapping dispatcher/webhook/chained pulls harmless.
 */
export async function syncChannelOrders(
  ctx: SyncContext,
  params: {
    apiClient: ApiClient;
    channelId: string;
    forceRefresh?: boolean;
    ports?: OrdersUpsertPorts;
  }
): Promise<SyncChannelOrdersResult> {
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

  const listingsWatermark = await getDomainWatermark(
    ctx,
    channelId,
    "listings"
  );
  if (listingsWatermark === null) {
    ctx.logger.info("Orders pull gated: listings have not synced yet", {
      channelId,
    });
    return {
      success: true,
      gated: true,
      totalPulled: 0,
      ordersUpserted: 0,
      shipmentsUpserted: 0,
      staleRejected: 0,
      errors: [],
    };
  }

  const syncedAt = await getDomainWatermark(ctx, channelId, "orders");
  const window = openSyncWindow({
    clock: ctx.clock,
    forceRefresh,
    syncedAt,
  });

  const errors: string[] = [];
  let conflicts = 0;
  let ordersUpserted = 0;
  let shipmentsUpserted = 0;
  let staleRejected = 0;
  let totalPulled = 0;
  let cursor: string | undefined;

  try {
    // Cursor-driven: the adapter contract only promises "cursor = null
    // means done" — an empty mid-stream page must not end the run.
    do {
      const page = await apiClient.getOrders({ cursor, since: window.since });
      totalPulled += page.data.length;
      if (page.data.length > 0) {
        const result = await upsertOrders(ctx, {
          channelId,
          orders: page.data,
          ports: {
            getFulfillments: (reference) =>
              apiClient.getFulfillments(reference),
            ...params.ports,
          },
        });
        ordersUpserted += result.newOrders + result.updatedOrders;
        shipmentsUpserted += result.shipmentsUpserted;
        staleRejected += result.staleRejected;
        conflicts += result.conflicts;
        for (const error of result.errors) {
          errors.push(`${error.reference}: ${error.error}`);
        }
      }
      cursor = page.cursor ?? undefined;
    } while (cursor);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const success = errors.length === 0;
  await recordDomainRun(ctx, {
    channelId,
    domain: "orders",
    organizationId,
    ranAt: ctx.clock.now(),
    success,
    conflicts,
    watermark: window.until,
    error: success ? null : errors.slice(0, 3).join("; "),
  });

  return {
    success,
    gated: false,
    totalPulled,
    ordersUpserted,
    shipmentsUpserted,
    staleRejected,
    errors,
  };
}
