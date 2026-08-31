/**
 * Raw Shopify status enum literals. Source-of-truth doc:
 * `packages/marketplace/docs/status-mapping.md`.
 */

export type ShopifyProductStatus = "ACTIVE" | "ARCHIVED" | "DRAFT" | "UNLISTED";

export interface ShopifyListingStatusInput {
  status: ShopifyProductStatus | string | null | undefined;
  /** Sum of inventory across variants; used to derive `out_of_stock` */
  totalInventory: number | null | undefined;
}

export type ShopifyDisplayFulfillmentStatus =
  | "FULFILLED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "OPEN"
  | "PARTIALLY_FULFILLED"
  | "PENDING_FULFILLMENT"
  | "REQUEST_DECLINED"
  | "RESTOCKED"
  | "SCHEDULED"
  | "UNFULFILLED";

export type ShopifyDisplayFinancialStatus =
  | "AUTHORIZED"
  | "EXPIRED"
  | "PAID"
  | "PARTIALLY_PAID"
  | "PARTIALLY_REFUNDED"
  | "PENDING"
  | "REFUNDED"
  | "VOIDED";

export interface ShopifyOrderStatusInput {
  cancelledAt: string | Date | null | undefined;
  closedAt: string | Date | null | undefined;
  financialStatus: ShopifyDisplayFinancialStatus | string | null | undefined;
  fulfillmentStatus:
    | ShopifyDisplayFulfillmentStatus
    | string
    | null
    | undefined;
}

export type ShopifyFulfillmentDisplayStatus =
  | "ATTEMPTED_DELIVERY"
  | "CANCELED"
  | "CARRIER_PICKED_UP"
  | "CONFIRMED"
  | "DELAYED"
  | "DELIVERED"
  | "FAILURE"
  | "FULFILLED"
  | "IN_TRANSIT"
  | "LABEL_PRINTED"
  | "LABEL_PURCHASED"
  | "LABEL_VOIDED"
  | "MARKED_AS_FULFILLED"
  | "NOT_DELIVERED"
  | "OUT_FOR_DELIVERY"
  | "PICKED_UP"
  | "READY_FOR_PICKUP"
  | "SUBMITTED";
