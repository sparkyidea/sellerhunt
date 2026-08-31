import { describe, expect, it } from "vitest";
import {
  mapOrder,
  type ShopifyOrderLineItemNode,
  type ShopifyOrderNode,
} from "../map-order";

function createLineItem(
  overrides: Partial<ShopifyOrderLineItemNode> = {}
): ShopifyOrderLineItemNode {
  return {
    id: "gid://shopify/LineItem/111",
    title: "Test Item",
    quantity: 5,
    currentQuantity: 5,
    sku: "SKU-1",
    variant: null,
    originalUnitPriceSet: { shopMoney: { amount: "10.00" } },
    discountedUnitPriceSet: { shopMoney: { amount: "10.00" } },
    originalTotalSet: { shopMoney: { amount: "50.00" } },
    discountedTotalSet: { shopMoney: { amount: "50.00" } },
    taxLines: [],
    ...overrides,
  };
}

function createOrder(
  overrides: Partial<ShopifyOrderNode> = {}
): ShopifyOrderNode {
  return {
    id: "gid://shopify/Order/999",
    legacyResourceId: "999",
    name: "#1001",
    email: null,
    phone: null,
    note: null,
    createdAt: "2026-08-01T10:00:00Z",
    processedAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-08-02T09:00:00Z",
    cancelledAt: null,
    cancelReason: null,
    closedAt: null,
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "UNFULFILLED",
    currencyCode: "USD",
    customer: null,
    paymentGatewayNames: [],
    totalPriceSet: { shopMoney: { amount: "50.00", currencyCode: "USD" } },
    subtotalPriceSet: null,
    totalShippingPriceSet: null,
    totalTaxSet: null,
    totalDiscountsSet: null,
    shippingAddress: null,
    billingAddress: null,
    shippingLine: null,
    lineItems: { edges: [{ node: createLineItem() }] },
    fulfillments: [],
    transactions: [],
    ...overrides,
  };
}

function createFulfillment(lineId: string, quantity: number) {
  return {
    id: "gid://shopify/Fulfillment/1",
    createdAt: "2026-08-01T12:00:00Z",
    fulfillmentLineItems: {
      edges: [{ node: { lineItem: { id: lineId }, quantity } }],
    },
  };
}

describe("mapOrder (shopify)", () => {
  it("maps updatedAt as the provider version clock", () => {
    const result = mapOrder(createOrder());
    expect(result.sourceVersionAt).toEqual(new Date("2026-08-02T09:00:00Z"));
  });

  describe("activeQuantity", () => {
    it("uses currentQuantity on a live order (order edit 5 -> 3)", () => {
      const result = mapOrder(
        createOrder({
          lineItems: {
            edges: [{ node: createLineItem({ currentQuantity: 3 }) }],
          },
        })
      );
      expect(result.orderLines[0]?.quantity).toBe(5);
      expect(result.orderLines[0]?.activeQuantity).toBe(3);
    });

    it("zeroes unfulfilled lines of a canceled order", () => {
      const result = mapOrder(
        createOrder({ cancelledAt: "2026-08-02T08:00:00Z" })
      );
      expect(result.orderLines[0]?.activeQuantity).toBe(0);
    });

    it("keeps only the fulfilled portion on a canceled order", () => {
      const result = mapOrder(
        createOrder({
          cancelledAt: "2026-08-02T08:00:00Z",
          fulfillments: [createFulfillment("gid://shopify/LineItem/111", 2)],
        })
      );
      expect(result.orderLines[0]?.activeQuantity).toBe(2);
    });

    it("caps the fulfilled portion at the ordered quantity", () => {
      const result = mapOrder(
        createOrder({
          cancelledAt: "2026-08-02T08:00:00Z",
          fulfillments: [
            createFulfillment("gid://shopify/LineItem/111", 4),
            createFulfillment("gid://shopify/LineItem/111", 4),
          ],
        })
      );
      expect(result.orderLines[0]?.activeQuantity).toBe(5);
    });

    it("attributes fulfillment quantities per line", () => {
      const result = mapOrder(
        createOrder({
          cancelledAt: "2026-08-02T08:00:00Z",
          lineItems: {
            edges: [
              { node: createLineItem() },
              {
                node: createLineItem({
                  id: "gid://shopify/LineItem/222",
                  quantity: 1,
                  currentQuantity: 1,
                }),
              },
            ],
          },
          fulfillments: [createFulfillment("gid://shopify/LineItem/222", 1)],
        })
      );
      expect(result.orderLines[0]?.activeQuantity).toBe(0);
      expect(result.orderLines[1]?.activeQuantity).toBe(1);
    });
  });
});
