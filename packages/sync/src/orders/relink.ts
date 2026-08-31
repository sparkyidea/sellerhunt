import {
  listing,
  listingVariant,
  order,
  orderLine,
} from "@dashseller/db/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { SyncContext } from "../context";

/**
 * Distinct order references with at least one late-linkable line: the line
 * stored a `listingVariantReference` at pull time but never resolved
 * (`listingVariantId` NULL), and a matching listing variant NOW exists on
 * the same channel. The variant must carry a `productVariantId` — without
 * one a re-pull still couldn't link, and the line would re-enqueue forever.
 *
 * Callers re-sync each reference through the standard `sync-order` job;
 * the COALESCE set-clause in the line upsert fills the ids and the
 * inventory pass (baseline rule included) runs end-to-end.
 *
 * Orders marked `remote_missing_at` (a prior single-order pull came back
 * not-found) are excluded — without that, permanently-gone orders occupy
 * the batch forever and starve reachable repairs behind the limit. The
 * ORDER BY keeps batches deterministic as the pool shrinks.
 *
 * Rule: ORD-002 — mark once, then skip; never retry not-found through the
 * generic retry path. ORD-003 — match on the stored reference only. No
 * SKU or title-similarity fallback: an unresolved line is visibly wrong,
 * a mis-resolved one silently attributes inventory to the wrong product.
 */
export async function findRelinkableOrders(
  ctx: SyncContext,
  params: { channelId: string; limit?: number }
): Promise<string[]> {
  const { channelId, limit = 200 } = params;
  const rows = await ctx.db
    .selectDistinct({ reference: order.reference })
    .from(orderLine)
    .innerJoin(order, eq(orderLine.orderId, order.id))
    .innerJoin(
      listingVariant,
      eq(listingVariant.reference, orderLine.listingVariantReference)
    )
    .innerJoin(listing, eq(listingVariant.listingId, listing.id))
    .where(
      and(
        eq(order.channelId, channelId),
        eq(listing.channelId, channelId),
        isNull(orderLine.listingVariantId),
        isNotNull(orderLine.listingVariantReference),
        isNotNull(listingVariant.productVariantId),
        isNotNull(order.reference),
        isNull(order.remoteMissingAt)
      )
    )
    .orderBy(order.reference)
    .limit(limit);
  return rows
    .map((row) => row.reference)
    .filter((reference): reference is string => reference !== null);
}
