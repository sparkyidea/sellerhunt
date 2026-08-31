import type { Order, OrderLine } from "../../../../types";
import { convertOrderStatus } from "../../enums";
import type {
  ShopifyDisplayFinancialStatus,
  ShopifyDisplayFulfillmentStatus,
} from "../../raw-types";
import {
  buildOrderAddress,
  type ShopifyMailingAddress,
} from "../helper/build-order-address";
import { extractPriceCents } from "../helper/extract-price";
import { generateVariantReference } from "../helper/generate-variant-reference";
import { stripGid } from "../helper/strip-gid";

interface ShopifyMoneyBag {
  shopMoney: { amount: string; currencyCode?: string };
}

export interface ShopifyOrderLineItemNode {
  /**
   * Quantity after edits, removals, and refund-removals — Shopify's own
   * "still part of the order" count. Basis of `OrderLine.activeQuantity`.
   */
  currentQuantity: number;
  discountedTotalSet: ShopifyMoneyBag;
  discountedUnitPriceSet: ShopifyMoneyBag;
  id: string;
  originalTotalSet: ShopifyMoneyBag;
  originalUnitPriceSet: ShopifyMoneyBag;
  quantity: number;
  sku: string | null;
  taxLines: Array<{ priceSet: ShopifyMoneyBag }>;
  title: string;
  variant: {
    id: string;
    product: { id: string } | null;
  } | null;
}

export interface ShopifyOrderTransaction {
  kind: string | null;
  paymentDetails:
    | { paymentMethodName?: string | null }
    | Record<string, never>
    | null;
  processedAt: string | null;
  status: string | null;
}

export interface ShopifyOrderNode {
  billingAddress: ShopifyMailingAddress | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  closedAt: string | null;
  createdAt: string;
  currencyCode: string;
  customer: {
    displayName: string | null;
    email: string | null;
    id: string;
  } | null;
  displayFinancialStatus: ShopifyDisplayFinancialStatus | string | null;
  displayFulfillmentStatus: ShopifyDisplayFulfillmentStatus | string | null;
  email: string | null;
  fulfillments: Array<{
    createdAt: string;
    fulfillmentLineItems: {
      edges: Array<{
        node: { lineItem: { id: string }; quantity: number };
      }>;
    };
    id: string;
  }>;
  id: string;
  legacyResourceId: string;
  lineItems: { edges: Array<{ node: ShopifyOrderLineItemNode }> };
  name: string;
  note: string | null;
  paymentGatewayNames: string[];
  phone: string | null;
  processedAt: string | null;
  shippingAddress: ShopifyMailingAddress | null;
  shippingLine: {
    carrierIdentifier: string | null;
    code: string | null;
    source: string | null;
    title: string | null;
  } | null;
  subtotalPriceSet: ShopifyMoneyBag | null;
  totalDiscountsSet: ShopifyMoneyBag | null;
  totalPriceSet: ShopifyMoneyBag;
  totalShippingPriceSet: ShopifyMoneyBag | null;
  totalTaxSet: ShopifyMoneyBag | null;
  transactions: ShopifyOrderTransaction[];
  updatedAt: string;
}

const PAID_FINANCIAL_STATUSES = new Set<ShopifyDisplayFinancialStatus>([
  "PAID",
  "PARTIALLY_PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
]);

const SHIPPED_FULFILLMENT_STATUSES = new Set<ShopifyDisplayFulfillmentStatus>([
  "FULFILLED",
  "PARTIALLY_FULFILLED",
]);

function moneyToCents(
  money: ShopifyMoneyBag | null | undefined
): number | null {
  if (!money) {
    return null;
  }
  return extractPriceCents(money.shopMoney.amount);
}

function pickPaidAt(transactions: ShopifyOrderTransaction[]): string | null {
  const sale = transactions.find(
    (t) =>
      (t.kind === "SALE" || t.kind === "CAPTURE") &&
      t.status === "SUCCESS" &&
      !!t.processedAt
  );
  return sale?.processedAt ?? null;
}

function pickPaymentMethod(
  transactions: ShopifyOrderTransaction[],
  gatewayNames: string[]
): string | null {
  const paid = transactions.find((t) => t.status === "SUCCESS");
  if (paid?.paymentDetails && "paymentMethodName" in paid.paymentDetails) {
    const name = paid.paymentDetails.paymentMethodName;
    if (name) {
      return name;
    }
  }
  return gatewayNames[0] ?? null;
}

function pickShippedAt(
  fulfillments: Array<{ createdAt: string }>
): string | null {
  const sorted = fulfillments
    .map((f) => f.createdAt)
    .sort((a, b) => a.localeCompare(b));
  return sorted[0] ?? null;
}

function computeListingVariantReference(
  item: ShopifyOrderLineItemNode
): string | null {
  if (!item.variant) {
    return null;
  }
  return generateVariantReference(
    item.variant.product?.id ?? "",
    item.variant.id,
    item.sku
  );
}

/**
 * Cumulative fulfilled quantity per line item id (stripped), summed across
 * the order's embedded fulfillments. Feeds the canceled-order derivation
 * below without a second API call.
 */
function sumFulfilledByLine(
  fulfillments: ShopifyOrderNode["fulfillments"]
): Map<string, number> {
  const fulfilled = new Map<string, number>();
  for (const fulfillment of fulfillments) {
    for (const edge of fulfillment.fulfillmentLineItems.edges) {
      const lineId = stripGid(edge.node.lineItem.id);
      fulfilled.set(lineId, (fulfilled.get(lineId) ?? 0) + edge.node.quantity);
    }
  }
  return fulfilled;
}

/**
 * Live order: Shopify's `currentQuantity` already reflects edits, removals,
 * and refund-removals. Canceled order: only the shipped portion keeps its
 * inventory claim — the unfulfilled remainder is released; any restock of
 * the shipped part goes through the return flow, never through cancellation.
 */
function deriveActiveQuantity(
  item: ShopifyOrderLineItemNode,
  orderCanceled: boolean,
  fulfilledByLine: Map<string, number>
): number {
  if (!orderCanceled) {
    return item.currentQuantity;
  }
  const fulfilled = fulfilledByLine.get(stripGid(item.id)) ?? 0;
  return Math.min(fulfilled, item.quantity);
}

function mapLineItems(
  items: ShopifyOrderLineItemNode[],
  orderCanceled: boolean,
  fulfilledByLine: Map<string, number>
): OrderLine[] {
  return items.map((item) => {
    const unitPrice = moneyToCents(item.originalUnitPriceSet);
    const total = moneyToCents(item.discountedTotalSet);
    const originalTotal = moneyToCents(item.originalTotalSet);
    const discount =
      originalTotal != null && total != null && originalTotal > total
        ? originalTotal - total
        : null;
    const tax =
      item.taxLines.length > 0
        ? item.taxLines.reduce(
            (sum, line) => sum + (moneyToCents(line.priceSet) ?? 0),
            0
          )
        : null;

    return {
      title: item.title,
      quantity: item.quantity,
      activeQuantity: deriveActiveQuantity(
        item,
        orderCanceled,
        fulfilledByLine
      ),
      sku: item.sku,
      unitPrice,
      discount,
      tax,
      total,
      reference: stripGid(item.id),
      listingVariantReference: computeListingVariantReference(item),
    };
  });
}

/**
 * Map a Shopify order to a normalized {@link Order}. eBay-only fields
 * (`shipBy`, `deliverBy`, `deliveredAt`, `sellerNote`) are null because
 * Shopify doesn't expose per-order shipping deadlines or delivery confirmation
 * on this query — `deliveredAt` lives on individual fulfillments.
 *
 * `cancelState` follows the eBay convention: a free-form passthrough string
 * the trigger uses to upsert a cancellation `issue` row. We pass `"CANCELED"`
 * when `cancelledAt` is set, `"NONE_REQUESTED"` otherwise.
 */
export function mapOrder(node: ShopifyOrderNode): Order {
  const lineItems = node.lineItems.edges.map((e) => e.node);
  const orderedAt = node.processedAt
    ? new Date(node.processedAt)
    : new Date(node.createdAt);
  const paidAtIso = pickPaidAt(node.transactions);
  const shippedAtIso = pickShippedAt(node.fulfillments);

  return {
    reference: stripGid(node.id),
    orderNumber: node.name,
    customerUsername: node.customer?.displayName ?? null,
    billing: buildOrderAddress(node.billingAddress, node.email),
    shipping: buildOrderAddress(node.shippingAddress, node.email),
    subtotal: moneyToCents(node.subtotalPriceSet),
    shippingCost: moneyToCents(node.totalShippingPriceSet),
    discount: moneyToCents(node.totalDiscountsSet),
    tax: moneyToCents(node.totalTaxSet),
    total: moneyToCents(node.totalPriceSet),
    currency: node.currencyCode,
    orderedAt,
    status: convertOrderStatus({
      cancelledAt: node.cancelledAt,
      closedAt: node.closedAt,
      financialStatus: node.displayFinancialStatus,
      fulfillmentStatus: node.displayFulfillmentStatus,
    }),
    paid: PAID_FINANCIAL_STATUSES.has(
      node.displayFinancialStatus as ShopifyDisplayFinancialStatus
    ),
    paidAt: paidAtIso ? new Date(paidAtIso) : null,
    paymentMethod: pickPaymentMethod(
      node.transactions,
      node.paymentGatewayNames
    ),
    shipped: SHIPPED_FULFILLMENT_STATUSES.has(
      node.displayFulfillmentStatus as ShopifyDisplayFulfillmentStatus
    ),
    shippedAt: shippedAtIso ? new Date(shippedAtIso) : null,
    shipBy: null,
    deliverBy: null,
    deliveredAt: null,
    requestedShippingCarrier:
      node.shippingLine?.carrierIdentifier ?? node.shippingLine?.source ?? null,
    requestedShippingMethod:
      node.shippingLine?.code ?? node.shippingLine?.title ?? null,
    customerNote: node.note,
    sellerNote: null,
    cancelState: node.cancelledAt ? "CANCELED" : "NONE_REQUESTED",
    cancellationReason: node.cancelReason
      ? node.cancelReason.toLowerCase()
      : null,
    sourceVersionAt: new Date(node.updatedAt),
    orderLines: mapLineItems(
      lineItems,
      node.cancelledAt !== null,
      sumFulfilledByLine(node.fulfillments)
    ),
  };
}
