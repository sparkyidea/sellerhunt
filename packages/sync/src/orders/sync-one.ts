import { order } from "@dashseller/db/schema";
import type { ApiClient } from "@dashseller/marketplace/types";
import { and, eq, sql } from "drizzle-orm";
import type { SyncContext } from "../context";
import type { OrdersUpsertPorts, UpsertOrdersResult } from "./upsert-orders";
import { upsertOrders } from "./upsert-orders";
import { getDomainWatermark } from "./watermark";

export type SyncOneOrderOutcome =
  | { kind: "synced"; result: UpsertOrdersResult }
  /** Marketplace has no single-order endpoint — run a windowed pull instead. */
  | { kind: "fallback-required" }
  /** The order id doesn't resolve (e.g. notification outlived its order). */
  | { kind: "not-found" }
  /** Listings gate: terminal no-op — the post-listings chained full pull
   * covers this order. */
  | { kind: "awaiting-listings" };

/**
 * Webhook fast path: fetch exactly the order a notification named and run
 * it through the standard upsert. Callers feature-detect the fallback —
 * adapters without `getOrder` (none today, but the contract allows it)
 * get a windowed `sync-channel-orders` run instead.
 *
 * A `synced` outcome can still carry `result.errors` (e.g. a failed
 * fulfillment fetch skipped that order's inventory pass). Unlike the
 * windowed path there is no watermark held back to force a retry, so
 * callers MUST treat errors as a retryable failure, not success.
 */
export async function syncOneOrder(
  ctx: SyncContext,
  params: {
    apiClient: ApiClient;
    channelId: string;
    orderReference: string;
    ports?: OrdersUpsertPorts;
  }
): Promise<SyncOneOrderOutcome> {
  const { apiClient, channelId, orderReference } = params;

  // Listings-first gate, checked BEFORE spending an API call: while the
  // listings watermark is null this order would land unlinked anyway, and
  // the chained first orders pull will fetch it.
  const listingsWatermark = await getDomainWatermark(
    ctx,
    channelId,
    "listings"
  );
  if (listingsWatermark === null) {
    ctx.logger.info("sync-order gated: listings have not synced yet", {
      channelId,
      orderReference,
    });
    return { kind: "awaiting-listings" };
  }

  if (!apiClient.getOrder) {
    return { kind: "fallback-required" };
  }

  const orderData = await apiClient.getOrder(orderReference);
  if (!orderData) {
    ctx.logger.info("Order not found at marketplace — nothing to sync", {
      channelId,
      orderReference,
    });
    // Tombstone-lite: mark any local copy so late-link repair stops
    // re-enqueueing an order the marketplace no longer resolves. A later
    // successful upsert clears the mark. No-op when no local row exists.
    await ctx.db
      .update(order)
      .set({ remoteMissingAt: sql`now()` })
      .where(
        and(eq(order.channelId, channelId), eq(order.reference, orderReference))
      );
    return { kind: "not-found" };
  }

  const result = await upsertOrders(ctx, {
    channelId,
    orders: [orderData],
    ports: {
      getFulfillments: (reference) => apiClient.getFulfillments(reference),
      ...params.ports,
    },
  });
  return { kind: "synced", result };
}
