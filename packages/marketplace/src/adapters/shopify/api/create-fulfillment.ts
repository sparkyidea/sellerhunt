import { normalizeTracking } from "@dashseller/shipment-tracking/utils";
import type {
  CreateShipmentPayload,
  CreateShipmentResult,
} from "../../../types";
import type { ShopifyAdminClient } from "../create-shopify-client";
import { formatGraphQLError } from "./helper/format-graphql-error";
import { stripGid, toGid } from "./helper/strip-gid";

const FULFILLMENT_ORDERS_QUERY = `#graphql
  query OrderFulfillmentOrders($id: ID!) {
    order(id: $id) {
      id
      fulfillmentOrders(first: 10) {
        edges {
          node {
            id
            status
            lineItems(first: 100) {
              edges {
                node {
                  id
                  remainingQuantity
                  lineItem {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const FULFILLMENT_CREATE_MUTATION = `#graphql
  mutation FulfillmentCreate($fulfillment: FulfillmentV2Input!) {
    fulfillmentCreateV2(fulfillment: $fulfillment) {
      fulfillment {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface FulfillmentOrderLineItemNode {
  id: string;
  lineItem: { id: string };
  remainingQuantity: number;
}

interface FulfillmentOrderNode {
  id: string;
  lineItems: { edges: Array<{ node: FulfillmentOrderLineItemNode }> };
  status: string;
}

interface FulfillmentOrdersQueryData {
  order: {
    fulfillmentOrders: { edges: Array<{ node: FulfillmentOrderNode }> };
  } | null;
}

interface FulfillmentCreateMutationData {
  fulfillmentCreateV2: {
    fulfillment: { id: string } | null;
    userErrors: Array<{ field: string[]; message: string }>;
  };
}

const OPEN_FULFILLMENT_ORDER_STATUSES = new Set(["OPEN", "IN_PROGRESS"]);

/**
 * Re-key payload line items (which use the order's `lineItem.id`) to the
 * matching `fulfillmentOrderLineItem.id`s within a fulfillment-order. Shopify
 * mutates against fulfillment-order line items, but our `CreateShipmentPayload`
 * carries the order line item IDs (matching what `getOrders` returns).
 *
 * We clamp to `remainingQuantity` so a duplicate fulfill request can't
 * over-count, and skip lines the fulfillment-order doesn't carry (they belong
 * to a different fulfillment-order, which is rare but happens for split
 * locations).
 */
function rekeyLineItems(
  payloadLineItems: CreateShipmentPayload["lineItems"],
  foLineItems: FulfillmentOrderLineItemNode[]
): Array<{ id: string; quantity: number }> {
  // payload.lineItems carry stripped IDs (matching what `getOrders` returns);
  // strip the FO's `lineItem.id` GID before keying so lookups match.
  const byOrderLineId = new Map<string, FulfillmentOrderLineItemNode>(
    foLineItems.map((li) => [stripGid(li.lineItem.id), li])
  );

  const result: Array<{ id: string; quantity: number }> = [];
  for (const payloadLine of payloadLineItems) {
    const fo = byOrderLineId.get(payloadLine.lineItemId);
    if (!fo || fo.remainingQuantity <= 0) {
      continue;
    }
    result.push({
      id: fo.id,
      quantity: Math.min(payloadLine.quantity, fo.remainingQuantity),
    });
  }
  return result;
}

/**
 * Create a fulfillment for a Shopify order. Two-step flow:
 *
 *   1. Query `order.fulfillmentOrders` for the open work-order(s) the seller
 *      can fulfill against, and the per-FO line item IDs.
 *   2. Re-key payload line items by the FO's mapping (payload uses order
 *      `lineItem.id`; mutation needs `fulfillmentOrderLineItem.id`).
 *   3. Call `fulfillmentCreateV2` with one entry per fulfillment-order.
 *
 * Required scopes: `read_merchant_managed_fulfillment_orders`,
 * `write_merchant_managed_fulfillment_orders`. Channels authorized before
 * these scopes were added must reconnect.
 */
export async function createFulfillment(
  client: ShopifyAdminClient,
  orderId: string,
  payload: CreateShipmentPayload
): Promise<CreateShipmentResult> {
  const orderGid = toGid("Order", orderId);
  const foResponse = await client.request<FulfillmentOrdersQueryData>(
    FULFILLMENT_ORDERS_QUERY,
    { variables: { id: orderGid } }
  );

  if (!foResponse.data?.order) {
    throw new Error(
      `Shopify fulfillmentOrders query failed: ${formatGraphQLError(foResponse.errors, `Order not found: ${orderId}`)}`
    );
  }

  const openFulfillmentOrders = foResponse.data.order.fulfillmentOrders.edges
    .map((edge) => edge.node)
    .filter((fo) => OPEN_FULFILLMENT_ORDER_STATUSES.has(fo.status));

  if (openFulfillmentOrders.length === 0) {
    throw new Error(
      `No open fulfillment orders for ${orderId} — order may already be fulfilled or closed`
    );
  }

  const lineItemsByFulfillmentOrder = openFulfillmentOrders
    .map((fo) => ({
      fulfillmentOrderId: fo.id,
      fulfillmentOrderLineItems: rekeyLineItems(
        payload.lineItems,
        fo.lineItems.edges.map((e) => e.node)
      ),
    }))
    .filter((entry) => entry.fulfillmentOrderLineItems.length > 0);

  if (lineItemsByFulfillmentOrder.length === 0) {
    throw new Error(
      `Could not match payload line items to any open fulfillment order for ${orderId}`
    );
  }

  // Normalized at the adapter boundary so what Shopify stores matches
  // what `mapFulfillment` later returns on the read path — reconciliation
  // can rely on byte equality without re-normalizing the remote side.
  const fulfillmentInput = {
    notifyCustomer: false,
    trackingInfo: {
      company: payload.carrier,
      number: normalizeTracking(payload.tracking) ?? payload.tracking,
    },
    lineItemsByFulfillmentOrder,
  };

  // Shopify supports `Idempotency-Key` for graphql mutations
  // (https://shopify.dev/docs/api/usage/idempotent-requests). Caller passes
  // the outbox row UUID — same value used to dedup retries server-side.
  // Shopify does not echo this key on getFulfillments, so the
  // `client_reference` rung in our reconciliation ladder won't fire for
  // Shopify; tracking_match remains the read-path correlator. The benefit
  // here is push-side dedup: a duplicate worker run with the same outbox
  // ID will not create a second fulfillment.
  const requestOptions: {
    variables: { fulfillment: typeof fulfillmentInput };
    headers?: Record<string, string>;
  } = { variables: { fulfillment: fulfillmentInput } };
  if (payload.clientReferenceId) {
    requestOptions.headers = { "Idempotency-Key": payload.clientReferenceId };
  }

  const createResponse = await client.request<FulfillmentCreateMutationData>(
    FULFILLMENT_CREATE_MUTATION,
    requestOptions
  );

  if (!createResponse.data) {
    throw new Error(
      `Shopify fulfillmentCreateV2 failed: ${formatGraphQLError(createResponse.errors, "Unknown error")}`
    );
  }

  const { fulfillment, userErrors } = createResponse.data.fulfillmentCreateV2;
  if (userErrors.length > 0) {
    const messages = userErrors
      .map((err) => `${err.field?.join(".") ?? "(field?)"}: ${err.message}`)
      .join("; ");
    throw new Error(`Shopify fulfillmentCreateV2 userErrors: ${messages}`);
  }

  if (!fulfillment) {
    throw new Error("Shopify fulfillmentCreateV2 returned no fulfillment");
  }

  return { fulfillmentId: stripGid(fulfillment.id) };
}
