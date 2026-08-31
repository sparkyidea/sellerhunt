import { describe, expect, it } from "vitest";
import { identifyEbayEvent } from "../identify";
import { extractEbayShippedOrderId } from "../payloads/item-marked-shipped";

/** Captured verbatim from a testSubscription delivery, 2026-08-05. */
const ITEM_MARKED_SHIPPED_DATA = {
  itemMarkedShipped: {
    itemId: "395913613059",
    carrier: "USPS",
    orderId: "12-12455-13825",
    username: "seller123",
    lineItemId: "395913613059-1435629152026",
    shippedDate: "2025-01-01T16:11:09.000-04:00",
    publicUserId: "abc123",
    transactionId: "1435629152026",
    trackingNumber: "9361289688041608536524",
  },
};

describe("extractEbayShippedOrderId", () => {
  it("reads the order id from the nested wrapper", () => {
    expect(extractEbayShippedOrderId(ITEM_MARKED_SHIPPED_DATA)).toBe(
      "12-12455-13825"
    );
  });

  it("returns null rather than the item id when orderId is missing", () => {
    const data = { itemMarkedShipped: { itemId: "395913613059" } };

    // identifyEbayEvent falls back to itemId for tracing; feeding that to an
    // order fetch would look up a listing id as an order.
    expect(identifyEbayEvent("ITEM_MARKED_SHIPPED", data).resourceId).toBe(
      "395913613059"
    );
    expect(extractEbayShippedOrderId(data)).toBeNull();
  });

  it("returns null on an unwrapped or empty payload", () => {
    expect(extractEbayShippedOrderId({ orderId: "12-12455-13825" })).toBeNull();
    expect(extractEbayShippedOrderId({})).toBeNull();
  });

  it("ignores an empty order id so it can't be fetched", () => {
    expect(
      extractEbayShippedOrderId({ itemMarkedShipped: { orderId: "" } })
    ).toBeNull();
  });
});
