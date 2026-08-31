import { describe, expect, it } from "vitest";
import type { OrderLine, ShippingFulfillment } from "../../types";
import { deriveFulfilledQuantities } from "../derive-fulfilled";

function createLine(reference: string, quantity: number): OrderLine {
  return {
    reference,
    quantity,
    activeQuantity: quantity,
    title: null,
    sku: null,
    unitPrice: null,
    discount: null,
    tax: null,
    total: null,
    listingVariantReference: null,
  };
}

function createFulfillment(
  lineItems: Array<{ lineItemId: string; quantity: number }>
): ShippingFulfillment {
  return {
    reference: "f-1",
    tracking: null,
    carrier: null,
    clientReferenceId: null,
    method: null,
    lineItems,
    shippedAt: null,
  };
}

describe("deriveFulfilledQuantities", () => {
  it("sums quantities per line across fulfillments", () => {
    const order = { orderLines: [createLine("line-1", 5)] };
    const result = deriveFulfilledQuantities(order, [
      createFulfillment([{ lineItemId: "line-1", quantity: 2 }]),
      createFulfillment([{ lineItemId: "line-1", quantity: 1 }]),
    ]);
    expect(result.get("line-1")).toBe(3);
  });

  it("leaves never-fulfilled lines absent", () => {
    const order = {
      orderLines: [createLine("line-1", 5), createLine("line-2", 1)],
    };
    const result = deriveFulfilledQuantities(order, [
      createFulfillment([{ lineItemId: "line-1", quantity: 5 }]),
    ]);
    expect(result.has("line-2")).toBe(false);
  });

  it("substitutes the ordered quantity for eBay's zero-quantity lines", () => {
    const order = { orderLines: [createLine("line-1", 4)] };
    const result = deriveFulfilledQuantities(order, [
      createFulfillment([{ lineItemId: "line-1", quantity: 0 }]),
    ]);
    expect(result.get("line-1")).toBe(4);
  });

  it("contributes nothing for a zero-quantity item on an unknown line", () => {
    const order = { orderLines: [createLine("line-1", 4)] };
    const result = deriveFulfilledQuantities(order, [
      createFulfillment([{ lineItemId: "ghost", quantity: 0 }]),
    ]);
    expect(result.get("ghost")).toBe(0);
  });

  it("caps duplicated zero-quantity fulfillments at the ordered quantity", () => {
    const order = { orderLines: [createLine("line-1", 4)] };
    const result = deriveFulfilledQuantities(order, [
      createFulfillment([{ lineItemId: "line-1", quantity: 0 }]),
      createFulfillment([{ lineItemId: "line-1", quantity: 0 }]),
    ]);
    expect(result.get("line-1")).toBe(4);
  });

  it("caps a zero-quantity fulfillment after explicit partial quantities", () => {
    const order = { orderLines: [createLine("line-1", 4)] };
    const result = deriveFulfilledQuantities(order, [
      createFulfillment([{ lineItemId: "line-1", quantity: 3 }]),
      createFulfillment([{ lineItemId: "line-1", quantity: 0 }]),
    ]);
    expect(result.get("line-1")).toBe(4);
  });
});
