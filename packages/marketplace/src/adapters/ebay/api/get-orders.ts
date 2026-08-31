import type eBayApi from "ebay-api";
import type { GetOrdersOptions, Order, PageResult } from "../../../types";
import { mapOrder } from "./mapper/map-order";

const ORDERS_PER_PAGE = 200;
// eBay enforces a 2-year max lookback on the lastmodifieddate filter; clamp to
// 23 months so an extreme `since` (long downtime) silently falls back to a full
// pull instead of the API rejecting the request with errorId 30830.
const LAST_MODIFIED_MAX_AGE_MS = 23 * 30 * 24 * 60 * 60 * 1000;

/**
 * Fetch one page of orders from eBay using the Sell Fulfillment API.
 *
 * Cursor encodes: `offset:<number>`
 * Pass cursor from previous result to get next page.
 */
export async function getOrders(
  client: eBayApi,
  options?: GetOrdersOptions
): Promise<PageResult<Order>> {
  const offset = options?.cursor
    ? Number.parseInt(options.cursor.replace("offset:", ""), 10)
    : 0;

  const filters: string[] = [];

  const sinceWithinLookback =
    options?.since &&
    Date.now() - options.since.getTime() <= LAST_MODIFIED_MAX_AGE_MS;
  if (options?.since && sinceWithinLookback) {
    filters.push(`lastmodifieddate:[${options.since.toISOString()}..]`);
  }

  if (options?.status) {
    filters.push(`orderfulfillmentstatus:{${options.status}}`);
  }

  const filter = filters.length > 0 ? filters.join(",") : undefined;

  const response = await client.sell.fulfillment.getOrders({
    limit: ORDERS_PER_PAGE,
    offset,
    filter,
  });

  const orders = response.orders ?? [];

  if (orders.length === 0) {
    return { data: [], cursor: null };
  }

  const mappedOrders = orders.map((raw: unknown) => mapOrder(raw));

  const total = response.total ?? 0;
  const nextOffset = offset + ORDERS_PER_PAGE;
  const hasMore = nextOffset < total;

  return {
    data: mappedOrders,
    cursor: hasMore ? `offset:${nextOffset}` : null,
  };
}
