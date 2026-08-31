/**
 * Raw eBay status enum literals. Source-of-truth doc:
 * `packages/marketplace/docs/status-mapping.md`.
 */

export type EbayListingStatusRaw =
  | "ACTIVE"
  | "INACTIVE"
  | "OUT_OF_STOCK"
  | "NOT_LISTED"
  | "COMPLETED"
  | "ENDED"
  | "ADMINISTRATIVELY_ENDED";

/** Sell/Fulfillment API order status fields. eBay derives normalized status from three of these together. */
export interface EbayOrderStatusInput {
  /** `cancelStatus.cancelState` — `NONE_REQUESTED` | `CANCEL_PENDING` | `CANCEL_CLOSED_FOR_COMMITMENT` | `CANCELED` | `CANCEL_FAILED` */
  cancelState: string | null | undefined;
  /** `orderFulfillmentStatus` — `NOT_STARTED` | `IN_PROGRESS` | `FULFILLED` */
  fulfillmentStatus: string | null | undefined;
  /** `paymentSummary.paymentStatus` (preferred) or `orderPaymentStatus` */
  paymentStatus: string | null | undefined;
}

/**
 * eBay does not expose a discrete shipment status enum. Status is inferred
 * from the presence of `shippedDate` and `deliveredDate` only.
 */
export interface EbayShipmentStatusInput {
  /** ISO-8601 string from `ShippingFulfillment.deliveredDate` (when present) */
  deliveredDate?: string | null | undefined;
  /** ISO-8601 string from `ShippingFulfillment.shippedDate` */
  shippedDate: string | null | undefined;
}
