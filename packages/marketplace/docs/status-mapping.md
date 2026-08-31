# Marketplace Status Mapping — Source of Truth

This doc records how each marketplace-populated column in the dashseller
schema is derived from raw marketplace API fields. One section per DB column.

When adding a new marketplace adapter (or when an existing marketplace
revises its enum), update the relevant column section **before** changing
the mapping utilities in `../src/utils/*-status.ts`. The mapper code is
downstream of this doc, not the other way around.

**Last verified:** 2026-04-30

---

## Marketplace-populated columns

| DB column | Type | Mapping util | Section below |
|---|---|---|---|
| `order.status` | `order_status` enum | `utils/order-status.ts` | [↓](#orderstatus) |
| `order_line.status` | `order_line_status` enum | `utils/order-status.ts` | [↓](#order_linestatus) |
| `order.paidAt` | timestamp | inline in adapter mappers | [↓](#orderpaidat) |
| `order.shippedAt` | timestamp | inline in adapter mappers | [↓](#ordershippedat) |
| `order.deliveredAt` | timestamp | inline in adapter mappers | [↓](#orderdeliveredat) |
| `listing.status` | `listing_status` enum | `utils/listing-status.ts` | [↓](#listingstatus) |
| `shipment.status` | `shipment_status` enum | `utils/shipment-status.ts` | [↓](#shipmentstatus) |
| `issue.reason` + `issue.reason_code` | text | inline (per-adapter) | [↓](#issuereason) |
| `return_line.inspection_outcome` | `inspection_outcome` enum | warehouse-driven (no marketplace mapping) | [↓](#return_lineinspection_outcome) |

### Removed columns (do not exist in current schema)

The schema went through a consolidation; these columns from earlier drafts
are intentionally not present:

- `order.paid` / `order.shipped` (booleans) — derive from `paidAt IS NOT NULL` / `shippedAt IS NOT NULL` + `status`.
- `order.cancellationReason` — moved to `issue.reason` (linked via `issue_type = "cancellation"`).
- `order.status = "delivered"` — delivered is a shipment-level fact; query `shipment.status = "delivered"` joined to the order.
- `listing.status = "archived"` — listings already have an `archived` boolean column for soft-delete; Shopify `ARCHIVED` maps to `ended`.
- `return.status` enum + `return.reason` enum — both removed. Workflow state lives on the linked `issue`; physical state lives on the linked `shipment`. Reason lives on `issue.reason` / `issue.reason_code`.

For mapping fn behavior:
- **Status mappers** fall back to a sensible default (usually `pending` /
  `unfulfilled`) and emit `console.warn` on unknown raw values.
- **Stubs** (Amazon/Walmart/Etsy/TikTok adapters not yet implemented)
  **throw** to force an explicit decision and a doc update before going live.

---

<a id="orderstatus"></a>
## `order.status` — `order_status` enum

**Values:** `pending`, `unfulfilled`, `partially_fulfilled`, `fulfilled`, `completed`, `canceled`, `returned`, `refunded`

**What it represents:** the single high-level lifecycle of an order. By
design, this column collapses payment + fulfillment + cancellation +
post-sale states into one ordinal-ish enum so the UI can show a single
badge. Sub-states (paid, shipped, delivered) live on `paidAt` /
`shippedAt` / `shipment.status` instead.

The mapper composes multiple raw marketplace fields into this single
enum. Cell content shows the **conditions** that yield each value.

| `order.status` | eBay | Shopify | Amazon | Walmart | Etsy | TikTok Shop |
|---|---|---|---|---|---|---|
| `pending` | `orderFulfillmentStatus = NOT_STARTED` AND `paymentStatus ≠ PAID` | `displayFulfillmentStatus ∈ {OPEN, UNFULFILLED, RESTOCKED}` AND `displayFinancialStatus ∈ {PENDING, AUTHORIZED}`(unpaid) | `OrderStatus ∈ {Pending, PendingAvailability}` | line `Created` | Receipt `status ∈ {open, payment processing}` | order `UNPAID` |
| `unfulfilled` | `orderFulfillmentStatus = NOT_STARTED` AND `paymentStatus = PAID` | `displayFulfillmentStatus ∈ {IN_PROGRESS, ON_HOLD, PENDING_FULFILLMENT, REQUEST_DECLINED, SCHEDULED}` OR (`displayFulfillmentStatus ∈ {OPEN, UNFULFILLED, RESTOCKED}` AND payment paid-ish) | `OrderStatus ∈ {Unshipped, InvoiceUnconfirmed}` | line `Acknowledged` | Receipt `status = paid` AND `is_shipped = false` | order ∈ {`AWAITING_SHIPMENT`, `AWAITING_COLLECTION`} |
| `partially_fulfilled` | `orderFulfillmentStatus = IN_PROGRESS` | `displayFulfillmentStatus = PARTIALLY_FULFILLED` | `OrderStatus = PartiallyShipped` | (mixed: some lines `Shipped`, others not) | — | order `PARTIALLY_SHIPPING` |
| `fulfilled` | `orderFulfillmentStatus = FULFILLED` | `displayFulfillmentStatus = FULFILLED` AND `closedAt` IS NULL | `OrderStatus = Shipped` | line `Shipped` | Receipt `status = paid` AND `is_shipped = true` | order `IN_TRANSIT` |
| `completed` | — (eBay does not surface this) | `displayFulfillmentStatus = FULFILLED` AND `closedAt` IS NOT NULL | — | — | Receipt `status = completed` | order `COMPLETED` |
| `canceled` | `cancelStatus.cancelState = CANCELED` | `cancelledAt` IS NOT NULL | `OrderStatus ∈ {Canceled, Unfulfillable}` | line `Cancelled` | Receipt `status = canceled` | order `CANCELLED` |
| `returned` | (set when a Post-Order Return reaches `RETURN_RECEIVED`) | (set when associated `Return.status = OPEN`/`CLOSED` after items received) | (Returns Report) | (set when Return reaches `DELIVERED_AT_RETURN_CENTER`) | n/a (no Return resource) | (Return resource) |
| `refunded` | `paymentSummary.paymentStatus ∈ {FULLY_REFUNDED, PARTIALLY_REFUNDED}` | `displayFinancialStatus ∈ {REFUNDED, PARTIALLY_REFUNDED}` | (Finances `RefundEvent`) | line `Refund` | Receipt `status ∈ {fully refunded, partially refunded}` | (Return resource) |

**Notes:**
- Walmart applies status per-line; the adapter aggregates: any-`Refund` → `refunded`; all-`Cancelled` → `canceled`; all-`Shipped` → `fulfilled`; mixed Shipped/Acknowledged → `partially_fulfilled`; etc.
- Etsy has no `partially_fulfilled` — composes booleans (`is_paid`, `is_shipped`) with the `status` field.

---

<a id="order_linestatus"></a>
## `order_line.status` — `order_line_status` enum

**Values:** identical to `order.status` (`pending`, `unfulfilled`, `partially_fulfilled`, `fulfilled`, `completed`, `canceled`, `returned`, `refunded`).

**What it represents:** per-line-item lifecycle. Used when a marketplace tracks status per line (Walmart, Amazon FBA partial fulfillment) or when individual line items diverge (e.g. one shipped, one returned).

Treat `order.status` as a denormalized aggregate computed from line states (or the marketplace's aggregate field where provided). Don't compute it on every read — store both, sync atomically.

| Marketplace | Source | Notes |
|---|---|---|
| eBay | `lineItemFulfillmentStatus` (per line, same enum: `NOT_STARTED` / `IN_PROGRESS` / `FULFILLED`) | Composition rules from `order.status` apply per row. |
| Shopify | (derived from `LineItem` + `FulfillmentLineItem` + `Refund` joins) | Shopify doesn't expose a per-line enum; compute from quantities. |
| Amazon | `OrderItem` quantity-shipped vs ordered | No per-item status; derive from quantities. |
| Walmart | line `orderLineStatus` | Native source of truth — order.status is aggregated from lines. |
| Etsy | (no per-line state) | Lines inherit the receipt status. |
| TikTok Shop | (per-package enum) | Not yet verified — adapter is a stub. |

---

<a id="orderpaidat"></a>
## `order.paidAt` — timestamp

**What it represents:** when the buyer's payment settled. Boolean "is paid" is `paidAt IS NOT NULL`.

| Marketplace | Source field |
|---|---|
| eBay | `paymentSummary.payments[0].paymentDate` |
| Shopify | `Order.paidAt` (top-level) |
| Amazon | (not exposed — leave null) |
| Walmart | (not exposed; orders are only visible after payment, so `now()` on first sync is acceptable) |
| Etsy | `paid_timestamp` on earliest `ShopReceiptTransaction` |
| TikTok Shop | `paid_time` (epoch seconds) |

---

<a id="ordershippedat"></a>
## `order.shippedAt` — timestamp

**What it represents:** earliest fulfillment shipped-date. Boolean "is shipped" is `shippedAt IS NOT NULL` (or `status ∈ {partially_fulfilled, fulfilled, completed}`).

| Marketplace | Source field |
|---|---|
| eBay | `min(ShippingFulfillment.shippedDate)` across fulfillments |
| Shopify | `min(Fulfillment.createdAt)` |
| Amazon | first `EasyShipShipmentStatus` transition to `PickedUp` |
| Walmart | min `statusDate` of any line transitioning to `Shipped` |
| Etsy | earliest `shipped_timestamp` on any `ShopReceiptTransaction` |
| TikTok Shop | first package `shipping_time` |

---

<a id="orderdeliveredat"></a>
## `order.deliveredAt` — timestamp

**What it represents:** when carrier confirmed delivery. The query "is this order delivered?" should join to `shipment.status = "delivered"` instead — `order.deliveredAt` is a denormalized convenience timestamp populated by the sync job.

| Marketplace | Source field |
|---|---|
| eBay | `ShippingFulfillment.deliveredDate` (only when carrier delivery scan reaches eBay) |
| Shopify | (derived from `Fulfillment.events` where `status = DELIVERED`) |
| Amazon | (derived from `EasyShipShipmentStatus = Delivered` transition) |
| Walmart | line `statusDate` when transitioning to `Delivered` |
| Etsy | (not exposed; leave null) |
| TikTok Shop | `delivery_time` (when surfaced) |

---

<a id="listingstatus"></a>
## `listing.status` — `listing_status` enum

**Values:** `active`, `inactive`, `out_of_stock`, `draft`, `sold`, `ended`

**What it represents:** the lifecycle of a listing on the marketplace.

| `listing.status` | eBay (Inventory API) | Shopify (`ProductStatus`) | Amazon (Listings Items) | Walmart (`publishedStatus`) | Etsy (`ShopListing.state`) | TikTok Shop |
|---|---|---|---|---|---|---|
| `active` | `ACTIVE` | `ACTIVE` AND `totalInventory > 0` | `BUYABLE` AND `DISCOVERABLE` | `PUBLISHED` | `active` | (TBD) |
| `inactive` | `INACTIVE` | `UNLISTED` | `DISCOVERABLE` only (not buyable) | `UNPUBLISHED` | `inactive` | (TBD) |
| `out_of_stock` | `OUT_OF_STOCK` | `ACTIVE` AND `totalInventory ≤ 0` | (no native; derive from quantity = 0) | (no native) | (no native) | (TBD) |
| `draft` | `NOT_LISTED` (Inventory), `UNPUBLISHED` (Offer) | `DRAFT` | (pre-publish state) | `READY_TO_PUBLISH`, `IN_PROGRESS`, `STAGE` | `draft` | (TBD) |
| `sold` | (Trading API: `Completed`) | (no native) | — | — | `sold_out` | (TBD) |
| `ended` | `ENDED`, `ADMINISTRATIVELY_ENDED` | `ARCHIVED` | — | `SYSTEM_PROBLEM` (interpretation) | `expired` | (TBD) |

**Notes:**
- Shopify `ARCHIVED` maps to `ended` (the listing's lifecycle is done, not just paused). The dashseller `archived: boolean` column on the listing table tracks soft-delete independently.
- Shopify has no `out_of_stock`/`sold` natively — derived from `totalInventory`. Shopify products outlive sales, so there's no "sold" terminal state.

---

<a id="shipmentstatus"></a>
## `shipment.status` — `shipment_status` enum

**Values:** `pending`, `label_purchased`, `pickup_requested`, `picked_up`, `dropped_off`, `in_transit`, `out_for_delivery`, `delivered`, `undeliverable`, `damaged`, `lost`, `rejected_by_buyer`, `returned_to_sender`, `cancelled`

**What it represents:** the shipment's physical lifecycle, end-to-end. The shipment table is **direction-agnostic** — both outbound (seller → buyer) and return (buyer → seller) shipments use this enum. Whether a shipment is a return is determined by `EXISTS (SELECT 1 FROM return WHERE shipmentId = shipment.id)`.

| `shipment.status` | eBay | Shopify (`FulfillmentDisplayStatus`) | Amazon (`EasyShipShipmentStatus`) | Walmart | Etsy | TikTok Shop |
|---|---|---|---|---|---|---|
| `pending` | (default — no `shippedDate`) | (default — no display status yet) | `PendingSchedule` | n/a | n/a | (TBD) |
| `label_purchased` | (label exists, no `shippedDate`) | `LABEL_PRINTED`, `LABEL_PURCHASED`, `SUBMITTED` | (label issued; pre-pickup-request) | n/a | n/a | (TBD) |
| `pickup_requested` | — | `READY_FOR_PICKUP` | `PendingPickUp`, `PendingDropOff` | n/a | n/a | (TBD) |
| `picked_up` | — | `PICKED_UP`, `CARRIER_PICKED_UP`, `MARKED_AS_FULFILLED`, `FULFILLED` | `PickedUp`, `AtOriginFC` | n/a | n/a | (TBD) |
| `dropped_off` | — | — | `DroppedOff` | n/a | n/a | (TBD) |
| `in_transit` | `shippedDate` IS NOT NULL AND `deliveredDate` IS NULL | `IN_TRANSIT`, `CONFIRMED`, `DELAYED` | `AtDestinationFC` | (line transition `Shipped`) | n/a | order `IN_TRANSIT` |
| `out_for_delivery` | — | `OUT_FOR_DELIVERY` | `OutForDelivery` | — | n/a | (TBD) |
| `delivered` | `deliveredDate` IS NOT NULL | `DELIVERED` | `Delivered` | (line transition `Delivered`) | n/a | order `DELIVERED` |
| `undeliverable` | — | `ATTEMPTED_DELIVERY`, `NOT_DELIVERED` | `Undeliverable` | — | n/a | (TBD) |
| `damaged` | — | (no specific state) | `Damaged` | — | n/a | (TBD) |
| `lost` | — | `FAILURE` (generic) | `Lost` | — | n/a | (TBD) |
| `rejected_by_buyer` | — | — | `RejectedByBuyer` | — | n/a | (TBD) |
| `returned_to_sender` | — | — | `ReturningToSeller`, `ReturnedToSeller` | — | n/a | (TBD) |
| `cancelled` | — | `CANCELED`, `LABEL_VOIDED` | `LabelCanceled` | — | n/a | (TBD) |

**Notes:**
- eBay does not expose a discrete shipment-status enum. The mapper derives state from `shippedDate` and `deliveredDate` only. Sub-states (label_purchased, picked_up, out_for_delivery) require carrier-tracking integration.
- Walmart and Etsy don't expose shipment state — those rows only get populated when dashseller buys the label (Shippo/EasyPost) and the carrier reports back.
- Inspection / restocking happen **after** delivery — those events don't appear on `shipment.status`. They live on `return.inspectedAt` + `return_line.inspection_outcome` + `return_line.restockedAt`.

---

<a id="issuereason"></a>
## `issue.reason` + `issue.reason_code` — text

**What they represent:**
- `issue.reason` — verbatim free-form reason from the marketplace (e.g. eBay's `DEFECTIVE_ITEM` enum literal as a string, or Shopify's `OrderCancelReason.CUSTOMER`).
- `issue.reason_code` — dashseller's normalized text code. Values depend on `issue_type`. No DB enum constraint — the value space differs by type.

**Convention by `issue_type`:**

| `issue_type` | Suggested `reason_code` values |
|---|---|
| `cancellation` | `customer_request`, `out_of_stock`, `fraud`, `inventory`, `staff`, `address_unverifiable`, `other` |
| `return` | `defective`, `arrived_damaged`, `wrong_item`, `not_as_described`, `missing_parts`, `does_not_fit`, `changed_mind`, `arrived_late`, `found_better_price`, `not_authentic`, `ordered_by_mistake`, `other` |
| `refund` | (same as return, plus `price_adjustment`, `goodwill`) |
| `replacement` | `defective`, `arrived_damaged`, `wrong_item`, `missing_parts` |
| `warranty` | `defective`, `not_functioning`, `manufacturing_defect` |
| `claim` | `lost_in_transit`, `damaged_in_transit`, `wrong_address`, `not_received` |

**Per-marketplace mapping**

For `type = "cancellation"`:

| Marketplace | Source → `reason_code` |
|---|---|
| eBay | `cancelStatus.cancelRequests[0].cancelReason` (e.g. `BUYER_INITIATED_CANCELLATION` → `customer_request`, `OUT_OF_STOCK_OR_CANNOT_FULFILL` → `out_of_stock`) |
| Shopify | `cancelReason` (`CUSTOMER` → `customer_request`, `INVENTORY` → `out_of_stock`, `FRAUD` → `fraud`, `STAFF` → `staff`, `DECLINED` → `address_unverifiable`, `OTHER` → `other`) |
| Amazon | `CancellationReason` free text + `IsBuyerRequestedCancel` boolean → `customer_request` if buyer; else `other` |
| Walmart | `cancellationReasons` codes (XSD-only; verify at adapter time) |
| Etsy | n/a (no cancel reason field) |
| TikTok Shop | (`Get Cancel Reasons` lookup) |

For `type = "return"`:

| Marketplace | Source enum | Mapping |
|---|---|---|
| eBay | `ReturnReasonEnum` | `ARRIVED_DAMAGED` → `arrived_damaged`; `MISSING_PARTS` → `missing_parts`; `WRONG_ITEM` → `wrong_item`; `DEFECTIVE_ITEM` → `defective`; `NOT_AS_DESCRIBED` → `not_as_described`; `MISSED_ESTIMATED_DELIVERY` → `arrived_late`; `FOUND_BETTER_PRICE` → `found_better_price`; `DOESNT_FIT` → `does_not_fit`; `NOT_AUTHENTIC` → `not_authentic`; `ORDERED_BY_MISTAKE` → `ordered_by_mistake`; `NO_LONGER_NEED_ITEM`/`CHANGED_MIND`/`DIDNT_LIKE_IT` → `changed_mind` |
| Shopify | `ReturnReason` | `DEFECTIVE` → `defective`; `NOT_AS_DESCRIBED` → `not_as_described`; `WRONG_ITEM` → `wrong_item`; `SIZE_TOO_LARGE`/`SIZE_TOO_SMALL`/`COLOR`/`STYLE` → `does_not_fit`; `UNWANTED` → `changed_mind`; `OTHER`/`UNKNOWN` → `other` |
| Amazon | (FBA codes from `listReturnReasonCodes`) | `CR-DEFECTIVE` → `defective`; `CR-DAMAGED_BY_CARRIER`/`CR-DAMAGED_BY_FC` → `arrived_damaged`; `CR-ORDERED_WRONG_ITEM`/`CR-SWITCHEROO` → `wrong_item`; `AMZ-PG-BAD-DESC` → `not_as_described`; `CR-MISSING_PARTS` → `missing_parts`; `CR-MISSED_ESTIMATED_DELIVERY` → `arrived_late`; `CR-FOUND_BETTER_PRICE` → `found_better_price`; `CR-UNWANTED_ITEM` → `changed_mind`; `CR-UNAUTHORIZED_PURCHASE` → `ordered_by_mistake`; default → `other` |
| Walmart | (XSD-only) | Verify at adapter time |
| Etsy | n/a (no Return resource) | — |
| TikTok Shop | (`Get Reject Reasons` lookup) | Not yet verified |

These mappings live in the per-adapter `map-issue.ts` (or wherever an issue is created during sync) — there is no central reason-code utility because values are per-`issue_type`.

---

<a id="return_lineinspection_outcome"></a>
## `return_line.inspection_outcome` — `inspection_outcome` enum

**Values:** `new`, `open_box`, `used`, `damaged`, `defective`, `missing_items`, `wrong_item_returned`

**What it represents:** the inspector's condition assessment of a returned item, recorded when the package arrives at the warehouse. Not derived from any marketplace API — populated by warehouse staff via the dashseller UI.

The corresponding `return.inspectedAt` and `return.inspectedByUserId` fields capture the inspection event metadata; `return_line.restockable: boolean` and `return_line.restockedAt: timestamp` capture the action taken after inspection.

| Value | Meaning | Typical action |
|---|---|---|
| `new` | Pristine, unopened — fully restockable | Restock at full price |
| `open_box` | Opened but unused — restockable as open-box | Restock at open-box discount |
| `used` | Used — restockable only at reduced grade | Restock as used or write off |
| `damaged` | Physical damage from transit or buyer | File carrier claim or write off |
| `defective` | Non-functional (was already broken) | Write off, possibly file warranty claim |
| `missing_items` | Return is incomplete (some items absent) | Partial refund only; flag dispute |
| `wrong_item_returned` | Buyer sent something different from what they ordered | Reject return; flag dispute |

---

## API documentation references

Per-marketplace listing of the official enum/type pages cited above. Use
these to verify verbatim values when revising mappers.

### eBay — Sell APIs + Post-Order Return API

- `OrderFulfillmentStatusEnum`: https://developer.ebay.com/api-docs/sell/fulfillment/types/sel:OrderFulfillmentStatus
  Values: `NOT_STARTED`, `IN_PROGRESS`, `FULFILLED`
- `OrderPaymentStatusEnum`: https://developer.ebay.com/api-docs/sell/fulfillment/types/sel:OrderPaymentStatusEnum
  Values: `PAID`, `PENDING`, `FAILED`, `FULLY_REFUNDED`, `PARTIALLY_REFUNDED`
- `CancelStatus.cancelState`: https://developer.ebay.com/api-docs/sell/fulfillment/types/sel:CancelStatus
  Values: `NONE_REQUESTED`, `CANCEL_PENDING`, `CANCEL_CLOSED_FOR_COMMITMENT`, `CANCELED`, `CANCEL_FAILED`
- `ReasonForRefundEnum` (cancel reason): https://developer.ebay.com/api-docs/sell/fulfillment/types/api:ReasonForRefundEnum
- `ShippingFulfillment` (no status enum; date-derived): https://developer.ebay.com/api-docs/sell/fulfillment/types/sel:ShippingFulfillment
- Inventory API `ListingStatusEnum`: https://developer.ebay.com/api-docs/sell/inventory/types/slr:ListingStatusEnum
  Values: `ACTIVE`, `OUT_OF_STOCK`, `INACTIVE`, `ENDED`, `ADMINISTRATIVELY_ENDED`, `NOT_LISTED`
- Inventory API `OfferStatusEnum`: https://developer.ebay.com/api-docs/sell/inventory/types/slr:OfferStatusEnum
  Values: `PUBLISHED`, `UNPUBLISHED`
- Trading API `ListingStatusCodeType` (legacy XML): https://developer.ebay.com/devzone/xml/docs/reference/ebay/types/ListingStatusCodeType.html
- Post-Order `ReturnStateEnum`: https://developer.ebay.com/devzone/post-order/types/ReturnStateEnum.html
- Post-Order `ReturnReasonEnum`: https://developer.ebay.com/devzone/post-order/types/ReturnReasonEnum.html

### Shopify — Admin GraphQL API (latest, 2026-01)

- `OrderDisplayFulfillmentStatus`: https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderDisplayFulfillmentStatus
  Values: `FULFILLED`, `IN_PROGRESS`, `ON_HOLD`, `OPEN`, `PARTIALLY_FULFILLED`, `PENDING_FULFILLMENT`, `REQUEST_DECLINED`, `RESTOCKED`, `SCHEDULED`, `UNFULFILLED`
- `OrderDisplayFinancialStatus`: https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderDisplayFinancialStatus
  Values: `AUTHORIZED`, `EXPIRED`, `PAID`, `PARTIALLY_PAID`, `PARTIALLY_REFUNDED`, `PENDING`, `REFUNDED`, `VOIDED`
- `OrderCancelReason`: https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderCancelReason
  Values: `CUSTOMER`, `DECLINED`, `FRAUD`, `INVENTORY`, `OTHER`, `STAFF`
- `FulfillmentDisplayStatus`: https://shopify.dev/docs/api/admin-graphql/latest/enums/FulfillmentDisplayStatus
  Values: `ATTEMPTED_DELIVERY`, `CANCELED`, `CARRIER_PICKED_UP`, `CONFIRMED`, `DELAYED`, `DELIVERED`, `FAILURE`, `FULFILLED`, `IN_TRANSIT`, `LABEL_PRINTED`, `LABEL_PURCHASED`, `LABEL_VOIDED`, `MARKED_AS_FULFILLED`, `NOT_DELIVERED`, `OUT_FOR_DELIVERY`, `PICKED_UP`, `READY_FOR_PICKUP`, `SUBMITTED`
- `ProductStatus`: https://shopify.dev/docs/api/admin-graphql/latest/enums/ProductStatus
  Values: `ACTIVE`, `ARCHIVED`, `DRAFT`, `UNLISTED`
- `ReturnStatus`: https://shopify.dev/docs/api/admin-graphql/latest/enums/ReturnStatus
  Values: `CANCELED`, `CLOSED`, `DECLINED`, `OPEN`, `REQUESTED`
- `ReturnReason`: https://shopify.dev/docs/api/admin-graphql/latest/enums/ReturnReason
  Values: `COLOR`, `DEFECTIVE`, `NOT_AS_DESCRIBED`, `OTHER`, `SIZE_TOO_LARGE`, `SIZE_TOO_SMALL`, `STYLE`, `UNKNOWN`, `UNWANTED`, `WRONG_ITEM`

### Amazon — Selling Partner API (SP-API)

- `OrderStatus` (Orders v0): https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/ordersV0.json
  Values: `PendingAvailability`, `Pending`, `Unshipped`, `PartiallyShipped`, `Shipped`, `InvoiceUnconfirmed`, `Canceled`, `Unfulfillable`
- `EasyShipShipmentStatus` (MFN): same Orders v0 JSON
  Values: `PendingSchedule`, `PendingPickUp`, `PendingDropOff`, `LabelCanceled`, `PickedUp`, `DroppedOff`, `AtOriginFC`, `AtDestinationFC`, `Delivered`, `RejectedByBuyer`, `Undeliverable`, `ReturningToSeller`, `ReturnedToSeller`, `Lost`, `OutForDelivery`, `Damaged`
- Listings Items API summary `status`: https://github.com/amzn/selling-partner-api-models/blob/main/models/listings-items-api-model/listingsItems_2021-08-01.json
  Values: `BUYABLE`, `DISCOVERABLE`
- Return reason codes (FBA): https://developer-docs.amazon.com/sp-api/reference/listreturnreasoncodes

### Walmart — Marketplace API

- Order line lifecycle: https://developer.walmart.com/us-marketplace/docs/order-management-api-overview
  Values: `Created`, `Acknowledged`, `Shipped`, `Delivered`, `Cancelled`, `Refund`
- Item `publishedStatus`: https://developer.walmart.com/documentation/item-object-usage-and-status/
  Values: `PUBLISHED`, `READY_TO_PUBLISH`, `IN_PROGRESS`, `UNPUBLISHED`, `STAGE`, `SYSTEM_PROBLEM`
- Return top-level + event tags: https://developer.walmart.com/us-marketplace/docs/returns-and-refunds-api-overview
- Cancel/return reason codes: https://developer.walmart.com/us-marketplace/reference/cancelorderlines / https://developer.walmart.com/us-marketplace/reference/getreturns (XSD-only; not in static HTML)

### Etsy — Open API v3

- `ShopReceipt.status`: https://developers.etsy.com/documentation/reference#tag/Shop-Receipt
  Values: `paid`, `completed`, `open`, `payment processing`, `canceled`, `fully refunded`, `partially refunded`
- `ShopListing.state`: https://developers.etsy.com/documentation/reference#operation/getListing
  Values: `active`, `inactive`, `sold_out`, `draft`, `expired`

### TikTok Shop — Open API

- Order status (verified via SDK cross-reference): https://partner.tiktokshop.com/docv2/page/get-order-list-202309
  Values: `UNPAID`, `AWAITING_SHIPMENT`, `AWAITING_COLLECTION`, `PARTIALLY_SHIPPING`, `IN_TRANSIT`, `DELIVERED`, `COMPLETED`, `CANCELLED`
- Other status fields **not yet verified** (docs are JS-rendered): products, packages, returns. Pull from official Postman workspace at https://www.postman.com/tiktok-shop-open/tiktok-shop-public-workspace.

---

## Conventions

1. **Update this doc first.** Before adding or changing a mapping case, confirm the raw enum values from the official API doc and update the relevant column section above. The mapper code is the source of truth for the runtime; this doc is the source of truth for *why* the mapper looks the way it does.
2. **Default-fallback for status fields, never throw.** If a marketplace returns an unknown value (they add a new enum case mid-flight), the mapper falls back to a sensible status and emits `console.warn`.
3. **Default to `other` for return reasons.** Reason codes are constantly added; falling back to `other` is non-disruptive.
4. **Stubs throw.** Mappers for marketplaces without an implemented adapter throw an explicit "not yet implemented" error to force a doc update before the new mapper goes live.
5. **One file per status type.** `order-status.ts`, `listing-status.ts`, `shipment-status.ts`. Don't combine.
6. **Issue reasons live per-issue-type.** Don't try to build a single normalized return-reason enum — return reasons differ from cancellation reasons differ from claim reasons. The text-typed `issue.reason_code` lets each adapter emit values appropriate to the issue type without an over-constrained enum.
