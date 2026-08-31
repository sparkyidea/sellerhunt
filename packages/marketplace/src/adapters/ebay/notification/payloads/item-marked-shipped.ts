/** `notification.data` for ITEM_MARKED_SHIPPED, as eBay actually sends it. */
export interface EbayItemMarkedShippedData {
  itemMarkedShipped?: {
    carrier?: string;
    itemId?: string;
    lineItemId?: string;
    orderId?: string;
    publicUserId?: string;
    shippedDate?: string;
    trackingNumber?: string;
    username?: string;
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Pull the marketplace order id out of an ITEM_MARKED_SHIPPED payload.
 *
 * Everything is nested under `data.itemMarkedShipped` (verified 2026-08-05).
 *
 * Deliberately narrow: `identifyEbayEvent` reports `itemId` as the resource id
 * when `orderId` is missing, which is fine for tracing but would feed a listing
 * id into an order fetch. Returns null instead so the caller can fall back.
 */
export function extractEbayShippedOrderId(
  data: Record<string, unknown>
): string | null {
  const shipped = asRecord(data.itemMarkedShipped);
  return asString(shipped?.orderId);
}
