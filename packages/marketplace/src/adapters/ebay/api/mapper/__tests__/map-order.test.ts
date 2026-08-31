import type { components } from "ebay-api/lib/types/restful/specs/sell_fulfillment_v1_oas3.js";
import { describe, expect, it } from "vitest";
import { mapOrder } from "../map-order";

type EbayOrder = components["schemas"]["Order"];
type EbayLineItem = components["schemas"]["LineItem"];

function createLineItem(overrides: Partial<EbayLineItem> = {}): EbayLineItem {
  return {
    lineItemId: "line-1",
    legacyItemId: "123456789",
    title: "Test Item",
    sku: "SKU-1",
    quantity: 2,
    lineItemCost: { value: "10.00", currency: "USD" },
    total: { value: "20.00", currency: "USD" },
    ...overrides,
  };
}

function createOrder(overrides: Partial<EbayOrder> = {}): EbayOrder {
  return {
    orderId: "11-22222-33333",
    creationDate: "2026-08-01T10:00:00.000Z",
    lastModifiedDate: "2026-08-02T12:30:00.000Z",
    orderFulfillmentStatus: "NOT_STARTED",
    orderPaymentStatus: "PAID",
    paymentSummary: {
      payments: [
        {
          paymentStatus: "PAID",
          paymentDate: "2026-08-01T10:05:00.000Z",
          paymentMethod: "EBAY",
        },
      ],
    },
    pricingSummary: { total: { value: "20.00", currency: "USD" } },
    lineItems: [createLineItem()],
    ...overrides,
  };
}

describe("mapOrder", () => {
  describe("sourceVersionAt", () => {
    it("maps lastModifiedDate as the provider version clock", () => {
      const result = mapOrder(createOrder());
      expect(result.sourceVersionAt).toEqual(
        new Date("2026-08-02T12:30:00.000Z")
      );
    });

    it("is null when lastModifiedDate is absent", () => {
      const result = mapOrder(createOrder({ lastModifiedDate: undefined }));
      expect(result.sourceVersionAt).toBeNull();
    });
  });

  describe("activeQuantity", () => {
    it("equals the ordered quantity on a live order", () => {
      const result = mapOrder(createOrder());
      expect(result.orderLines[0]?.quantity).toBe(2);
      expect(result.orderLines[0]?.activeQuantity).toBe(2);
    });

    it("zeroes unfulfilled lines of a canceled order", () => {
      const result = mapOrder(
        createOrder({
          cancelStatus: { cancelState: "CANCELED" },
          lineItems: [
            createLineItem({
              lineItemId: "line-1",
              lineItemFulfillmentStatus: "NOT_STARTED",
            }),
          ],
        })
      );
      expect(result.status).toBe("canceled");
      expect(result.orderLines[0]?.quantity).toBe(2);
      expect(result.orderLines[0]?.activeQuantity).toBe(0);
    });

    it("keeps the quantity of fulfilled lines on a canceled order", () => {
      const result = mapOrder(
        createOrder({
          cancelStatus: { cancelState: "CANCELED" },
          lineItems: [
            createLineItem({
              lineItemId: "line-1",
              lineItemFulfillmentStatus: "FULFILLED",
            }),
            createLineItem({
              lineItemId: "line-2",
              quantity: 3,
              lineItemFulfillmentStatus: "NOT_STARTED",
            }),
          ],
        })
      );
      expect(result.orderLines[0]?.activeQuantity).toBe(2);
      expect(result.orderLines[1]?.activeQuantity).toBe(0);
    });

    it("does not zero lines while a cancellation is only requested", () => {
      const result = mapOrder(
        createOrder({ cancelStatus: { cancelState: "IN_PROGRESS" } })
      );
      expect(result.orderLines[0]?.activeQuantity).toBe(2);
    });
  });
});
