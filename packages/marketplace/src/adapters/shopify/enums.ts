import type { ListingStatus, OrderStatus } from "../../types";
import type {
  ShopifyListingStatusInput,
  ShopifyOrderStatusInput,
} from "./raw-types";

export function convertListingStatus(
  input: ShopifyListingStatusInput
): ListingStatus {
  switch (input.status) {
    case "ARCHIVED":
      // Shopify treats archived as the lifecycle-done state; map to `ended`.
      // (dashseller has a separate `archived: boolean` column for soft-delete.)
      return "ended";
    case "DRAFT":
      return "draft";
    case "UNLISTED":
      // UNLISTED products are visible by direct URL but not in the storefront — closest analog is `inactive`.
      return "inactive";
    case "ACTIVE":
      if (input.totalInventory != null && input.totalInventory <= 0) {
        return "out_of_stock";
      }
      return "active";
    default:
      return "draft";
  }
}

export function convertOrderStatus(
  input: ShopifyOrderStatusInput
): OrderStatus {
  if (input.cancelledAt) {
    return "canceled";
  }
  if (
    input.financialStatus === "REFUNDED" ||
    input.financialStatus === "PARTIALLY_REFUNDED"
  ) {
    return "refunded";
  }
  if (input.fulfillmentStatus === "FULFILLED") {
    return input.closedAt ? "completed" : "fulfilled";
  }
  if (input.fulfillmentStatus === "PARTIALLY_FULFILLED") {
    return "partially_fulfilled";
  }
  if (
    input.fulfillmentStatus === "IN_PROGRESS" ||
    input.fulfillmentStatus === "ON_HOLD" ||
    input.fulfillmentStatus === "PENDING_FULFILLMENT" ||
    input.fulfillmentStatus === "REQUEST_DECLINED" ||
    input.fulfillmentStatus === "SCHEDULED"
  ) {
    return "unfulfilled";
  }
  if (
    input.fulfillmentStatus === "OPEN" ||
    input.fulfillmentStatus === "UNFULFILLED" ||
    input.fulfillmentStatus === "RESTOCKED"
  ) {
    if (
      input.financialStatus === "PAID" ||
      input.financialStatus === "AUTHORIZED" ||
      input.financialStatus === "PARTIALLY_PAID"
    ) {
      return "unfulfilled";
    }
    return "pending";
  }
  return "pending";
}
