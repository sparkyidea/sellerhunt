/** `notification.data` for ORDER_CONFIRMATION, as eBay actually sends it. */
export interface EbayOrderConfirmationData {
  order?: {
    orderId?: string;
    orderLineItems?: Array<{
      listingId?: string;
      orderLineItemId?: string;
      quantity?: number;
    }>;
  };
  user?: {
    userId?: string;
    username?: string;
  };
}

export interface EbayOrderContext {
  orderId: string | null;
  /** Candidate seller ids, most-trusted first; match against `channel.reference`. */
  sellerUserIds: string[];
  /** Candidate seller usernames; match against `channel.displayName`. */
  sellerUsernames: string[];
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
 * Pull the order id and seller identity out of an ORDER_CONFIRMATION payload.
 *
 * Verified against a real production notification (2026-08-01): eBay nests the
 * seller under **`data.user`**, not `data.seller` —
 *
 *   { user: { userId, username }, order: { orderId, orderLineItems: [...] } }
 *
 * `data.user.userId` matches `channel.reference` and `data.user.username`
 * matches `channel.displayName`.
 */
export function extractEbayOrderContext(
  data: Record<string, unknown>
): EbayOrderContext {
  const order = asRecord(data.order);
  const user = asRecord(data.user);

  return {
    orderId: asString(order?.orderId),
    sellerUserIds: [asString(user?.userId)].filter(
      (v): v is string => v !== null
    ),
    sellerUsernames: [asString(user?.username)].filter(
      (v): v is string => v !== null
    ),
  };
}
