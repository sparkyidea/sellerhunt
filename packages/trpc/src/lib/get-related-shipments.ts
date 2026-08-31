import { db } from "@dashseller/db";
import { order, shipment } from "@dashseller/db/schema";
import { eq, or } from "drizzle-orm";

/**
 * Resolve every shipment that belongs to this order's merge root.
 *
 * For unmerged orders this is just `WHERE shipment.order_id = $1` — same as
 * a direct findMany. For child orders of a merged shipment, the actual
 * shipment row lives on the synthetic parent, so we resolve via
 * `order.parent_order_id` first.
 *
 * The returned list is consistent regardless of which child the caller
 * asked about — pass any child or the parent, get the same set back.
 *
 * Use this anywhere a query was previously `WHERE shipment.order_id = X`
 * and should continue to return the user-facing shipment after Phase 3's
 * merged-order support lands.
 */
export async function getRelatedShipments(orderId: string) {
  const row = await db.query.order.findFirst({
    where: eq(order.id, orderId),
    columns: { id: true, parentOrderId: true },
  });

  if (!row) {
    return [];
  }

  // If this order is a child of a merged shipment, the shipment row sits
  // on the parent. Match both so the caller can pass any merge member.
  const targetIds = row.parentOrderId ? [row.id, row.parentOrderId] : [row.id];

  return db.query.shipment.findMany({
    where: or(...targetIds.map((id) => eq(shipment.orderId, id))),
  });
}
