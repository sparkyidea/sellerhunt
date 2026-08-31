import type { Order, ShippingFulfillment } from "../types";

/**
 * Cumulative fulfilled quantity per order line (keyed by line `reference`),
 * derived from normalized fulfillments. This is the adapter-side contract
 * for the inventory delta derivation's `targetFulfilled` input: line
 * effects come from this plus `OrderLine.activeQuantity`, never from
 * order-level status.
 *
 * eBay quirk: fulfillment line items can report quantity 0, meaning "the
 * whole line". The fallback substitutes the line's REMAINING ordered
 * quantity (ordered minus what earlier fulfillments already attributed),
 * so multiple zero-quantity fulfillments for one line converge on the
 * ordered quantity instead of overcounting — an overcounted cumulative
 * would silently over-decrement stock downstream.
 */
export function deriveFulfilledQuantities(
  order: Pick<Order, "orderLines">,
  fulfillments: ShippingFulfillment[]
): Map<string, number> {
  const orderedByReference = new Map(
    order.orderLines.map((line) => [line.reference, line.quantity])
  );
  const fulfilled = new Map<string, number>();
  for (const fulfillment of fulfillments) {
    for (const item of fulfillment.lineItems) {
      const already = fulfilled.get(item.lineItemId) ?? 0;
      const contribution =
        item.quantity > 0
          ? item.quantity
          : Math.max(
              0,
              (orderedByReference.get(item.lineItemId) ?? 0) - already
            );
      fulfilled.set(item.lineItemId, already + contribution);
    }
  }
  return fulfilled;
}
