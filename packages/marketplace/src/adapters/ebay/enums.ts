import type { ListingStatus, OrderStatus } from "../../types";
import type { EbayOrderStatusInput } from "./raw-types";

export function convertListingStatus(
  raw: string | null | undefined
): ListingStatus {
  if (!raw) {
    return "ended";
  }
  switch (raw.toUpperCase()) {
    case "ACTIVE":
      return "active";
    case "INACTIVE":
      return "inactive";
    case "OUT_OF_STOCK":
      return "out_of_stock";
    case "NOT_LISTED":
      return "draft";
    case "COMPLETED":
      return "sold";
    case "ENDED":
    case "ADMINISTRATIVELY_ENDED":
      return "ended";
    default:
      return "ended";
  }
}

export function convertOrderStatus(input: EbayOrderStatusInput): OrderStatus {
  if (input.cancelState === "CANCELED") {
    return "canceled";
  }
  if (
    input.paymentStatus === "FULLY_REFUNDED" ||
    input.paymentStatus === "PARTIALLY_REFUNDED"
  ) {
    return "refunded";
  }

  switch (input.fulfillmentStatus) {
    case "FULFILLED":
      return "fulfilled";
    case "IN_PROGRESS":
      // eBay's IN_PROGRESS = some line items shipped, not all.
      return "partially_fulfilled";
    case "NOT_STARTED":
      return input.paymentStatus === "PAID" ? "unfulfilled" : "pending";
    default:
      return "pending";
  }
}
