import { describe, expect, it } from "vitest";
import { extractEbayOrderContext } from "../payloads/order-confirmation";

/**
 * Captured verbatim from the first real ORDER_CONFIRMATION eBay delivered to
 * the production endpoint (notification b64130e4-…, 2026-08-01). eBay
 * publishes no field contract for this topic, so this fixture IS the contract
 * — any parser change has to keep satisfying it.
 */
const REAL_ORDER_CONFIRMATION_DATA = {
  user: {
    userId: "y9qonyvfrqq",
    username: "mcd-toy",
  },
  order: {
    orderId: "11-14972-20806",
    orderLineItems: [
      {
        quantity: 1,
        listingId: "406447250843",
        orderLineItemId: "10083872001911",
      },
    ],
  },
};

describe("extractEbayOrderContext", () => {
  it("reads seller identity from the real payload's `user` object", () => {
    const context = extractEbayOrderContext(REAL_ORDER_CONFIRMATION_DATA);

    expect(context.orderId).toBe("11-14972-20806");
    // Regression: an earlier version only read `data.seller`, so this real
    // notification produced no seller candidates, matched no channel, and the
    // order was silently dropped as `ignored`.
    expect(context.sellerUserIds).toContain("y9qonyvfrqq");
    expect(context.sellerUsernames).toContain("mcd-toy");
  });

  it("returns empty candidates rather than throwing on an unknown shape", () => {
    const context = extractEbayOrderContext({ something: "unexpected" });

    expect(context.orderId).toBeNull();
    expect(context.sellerUserIds).toEqual([]);
    expect(context.sellerUsernames).toEqual([]);
  });

  it("ignores empty strings so they can't match a channel", () => {
    const context = extractEbayOrderContext({
      user: { userId: "", username: "" },
      order: { orderId: "" },
    });

    expect(context.orderId).toBeNull();
    expect(context.sellerUserIds).toEqual([]);
    expect(context.sellerUsernames).toEqual([]);
  });
});
