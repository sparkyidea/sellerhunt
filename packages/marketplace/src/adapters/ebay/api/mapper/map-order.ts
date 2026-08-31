import type { components } from "ebay-api/lib/types/restful/specs/sell_fulfillment_v1_oas3.js";
import type { Order, OrderAddress, OrderLine } from "../../../../types";
import { convertOrderStatus } from "../../enums";
import { generateVariantReference } from "../helper/generate-variant-reference";

type EbayOrder = components["schemas"]["Order"];
type EbayLineItem = components["schemas"]["LineItem"];
type EbayExtendedContact = components["schemas"]["ExtendedContact"];
type EbayFulfillmentInstruction =
  components["schemas"]["FulfillmentStartInstruction"];

function toCents(value?: string): number | null {
  if (!value) {
    return null;
  }
  const num = Number.parseFloat(value);
  if (Number.isNaN(num)) {
    return null;
  }
  return Math.round(num * 100);
}

function mapAddress(contact?: EbayExtendedContact): OrderAddress {
  return {
    name: contact?.fullName ?? null,
    company: contact?.companyName ?? null,
    email: contact?.email ?? null,
    phone: contact?.primaryPhone?.phoneNumber ?? null,
    address1: contact?.contactAddress?.addressLine1 ?? null,
    address2: contact?.contactAddress?.addressLine2 ?? null,
    city: contact?.contactAddress?.city ?? null,
    state: contact?.contactAddress?.stateOrProvince ?? null,
    zipCode: contact?.contactAddress?.postalCode?.split("-")[0] ?? null,
    countryCode: contact?.contactAddress?.countryCode ?? null,
  };
}

function mapShippingAddress(
  instructions?: EbayFulfillmentInstruction[]
): OrderAddress {
  const shipTo = instructions?.[0]?.shippingStep?.shipTo;
  if (!shipTo) {
    return {
      name: null,
      company: null,
      email: null,
      phone: null,
      address1: null,
      address2: null,
      city: null,
      state: null,
      zipCode: null,
      countryCode: null,
    };
  }
  return {
    name: shipTo.fullName ?? null,
    company: shipTo.companyName ?? null,
    email: shipTo.email ?? null,
    phone: shipTo.primaryPhone?.phoneNumber ?? null,
    address1: shipTo.contactAddress?.addressLine1 ?? null,
    address2: shipTo.contactAddress?.addressLine2 ?? null,
    city: shipTo.contactAddress?.city ?? null,
    state: shipTo.contactAddress?.stateOrProvince ?? null,
    zipCode: shipTo.contactAddress?.postalCode?.split("-")[0] ?? null,
    countryCode: shipTo.contactAddress?.countryCode ?? null,
  };
}

function computeListingVariantReference(item: EbayLineItem): string | null {
  if (!item.legacyItemId) {
    return null;
  }
  const aspects = item.variationAspects;
  const attributes =
    aspects && Array.isArray(aspects)
      ? Object.fromEntries(aspects.map((a) => [a.name ?? "", a.value ?? ""]))
      : {};
  return generateVariantReference(item.legacyItemId, attributes);
}

/**
 * eBay cancels whole orders only (no partial line cancellation), so the
 * order-level cancel state is projected onto lines here, at the adapter:
 * an unfulfilled line of a canceled order has no remaining inventory claim,
 * while a fulfilled line already shipped — cancellation can't take that
 * back (any restock goes through the return flow).
 */
function deriveActiveQuantity(
  item: EbayLineItem,
  orderCanceled: boolean
): number {
  const quantity = item.quantity ?? 1;
  if (!orderCanceled) {
    return quantity;
  }
  return item.lineItemFulfillmentStatus === "FULFILLED" ? quantity : 0;
}

function mapLineItems(
  items: EbayLineItem[],
  orderCanceled: boolean
): OrderLine[] {
  return items.map((item) => {
    const lineTax = item.taxes?.reduce(
      (sum, t) => sum + (toCents(t.amount?.value) ?? 0),
      0
    );

    const unitPrice = toCents(item.lineItemCost?.value);
    const discountedCost = toCents(item.discountedLineItemCost?.value);
    const discount =
      unitPrice != null && discountedCost != null
        ? unitPrice - discountedCost
        : null;

    return {
      title: item.title ?? null,
      quantity: item.quantity ?? 1,
      activeQuantity: deriveActiveQuantity(item, orderCanceled),
      sku: item.sku ?? null,
      unitPrice,
      discount,
      tax: lineTax ?? null,
      total: toCents(item.total?.value),
      reference: item.lineItemId ?? "",
      listingVariantReference: computeListingVariantReference(item),
    };
  });
}

/**
 * Map eBay Fulfillment API order to normalized Order
 */
export function mapOrder(raw: unknown): Order {
  const ebayOrder = raw as EbayOrder;

  const payment = ebayOrder.paymentSummary?.payments?.[0];
  const instructions = ebayOrder.fulfillmentStartInstructions;
  const shippingStep = instructions?.[0]?.shippingStep;

  const isPaid = payment?.paymentStatus === "PAID";
  const isShipped = ebayOrder.orderFulfillmentStatus === "FULFILLED";

  return {
    reference: ebayOrder.orderId ?? "",
    orderNumber: ebayOrder.salesRecordReference ?? null,
    customerUsername: ebayOrder.buyer?.username ?? null,
    billing: mapAddress(ebayOrder.buyer?.buyerRegistrationAddress),
    shipping: mapShippingAddress(instructions),
    subtotal: toCents(ebayOrder.pricingSummary?.priceSubtotal?.value),
    shippingCost: toCents(ebayOrder.pricingSummary?.deliveryCost?.value),
    discount: toCents(ebayOrder.pricingSummary?.priceDiscount?.value),
    tax: toCents(ebayOrder.pricingSummary?.tax?.value),
    total: toCents(ebayOrder.pricingSummary?.total?.value),
    currency: ebayOrder.pricingSummary?.total?.currency ?? "USD",
    orderedAt: new Date(ebayOrder.creationDate ?? ""),
    status: convertOrderStatus({
      fulfillmentStatus: ebayOrder.orderFulfillmentStatus,
      paymentStatus: payment?.paymentStatus ?? ebayOrder.orderPaymentStatus,
      cancelState: ebayOrder.cancelStatus?.cancelState,
    }),
    paid: isPaid,
    paidAt: payment?.paymentDate ? new Date(payment.paymentDate) : null,
    paymentMethod: payment?.paymentMethod ?? null,
    shipped: isShipped,
    shippedAt: null,
    shipBy: ebayOrder.lineItems?.[0]?.lineItemFulfillmentInstructions
      ?.shipByDate
      ? new Date(
          ebayOrder.lineItems[0].lineItemFulfillmentInstructions.shipByDate
        )
      : null,
    deliverBy: instructions?.[0]?.maxEstimatedDeliveryDate
      ? new Date(instructions[0].maxEstimatedDeliveryDate)
      : null,
    deliveredAt: null,
    requestedShippingCarrier: shippingStep?.shippingCarrierCode ?? null,
    requestedShippingMethod: shippingStep?.shippingServiceCode ?? null,
    customerNote: ebayOrder.buyerCheckoutNotes ?? null,
    sellerNote: null,
    cancelState: ebayOrder.cancelStatus?.cancelState ?? null,
    cancellationReason:
      ebayOrder.cancelStatus?.cancelRequests?.[0]?.cancelReason ?? null,
    sourceVersionAt: ebayOrder.lastModifiedDate
      ? new Date(ebayOrder.lastModifiedDate)
      : null,
    orderLines: mapLineItems(
      ebayOrder.lineItems ?? [],
      ebayOrder.cancelStatus?.cancelState === "CANCELED"
    ),
  };
}
