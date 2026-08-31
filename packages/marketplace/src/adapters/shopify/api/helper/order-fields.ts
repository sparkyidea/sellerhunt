/**
 * The one order selection set, shared by `get-orders.ts` (list) and
 * `get-order.ts` (single). Both interpolate it, so a webhook-driven targeted
 * fetch and a windowed pull can't drift into mapping different orders
 * differently.
 *
 * Any field added here must also be added to `ShopifyOrderNode` in
 * `mapper/map-order.ts` — the query is a string, so the compiler won't tell you.
 */
export const ORDER_FIELDS_FRAGMENT = `#graphql
  fragment OrderFields on Order {
    id
    name
    legacyResourceId
    email
    phone
    note
    processedAt
    createdAt
    updatedAt
    cancelledAt
    cancelReason
    closedAt
    displayFinancialStatus
    displayFulfillmentStatus
    currencyCode
    customer {
      id
      displayName
      email
    }
    paymentGatewayNames
    totalPriceSet { shopMoney { amount currencyCode } }
    subtotalPriceSet { shopMoney { amount } }
    totalShippingPriceSet { shopMoney { amount } }
    totalTaxSet { shopMoney { amount } }
    totalDiscountsSet { shopMoney { amount } }
    shippingAddress {
      firstName lastName company address1 address2 city province provinceCode zip country countryCode phone
    }
    billingAddress {
      firstName lastName company address1 address2 city province provinceCode zip country countryCode phone
    }
    shippingLine {
      code title source carrierIdentifier
    }
    lineItems(first: 100) {
      edges {
        node {
          id
          title
          quantity
          currentQuantity
          sku
          variant {
            id
            product { id }
          }
          originalUnitPriceSet { shopMoney { amount } }
          discountedUnitPriceSet { shopMoney { amount } }
          originalTotalSet { shopMoney { amount } }
          discountedTotalSet { shopMoney { amount } }
          taxLines { priceSet { shopMoney { amount } } }
        }
      }
    }
    fulfillments {
      id
      createdAt
      fulfillmentLineItems(first: 100) {
        edges {
          node {
            quantity
            lineItem { id }
          }
        }
      }
    }
    transactions {
      id
      kind
      status
      processedAt
      paymentDetails {
        ... on CardPaymentDetails { paymentMethodName }
      }
    }
  }
`;
