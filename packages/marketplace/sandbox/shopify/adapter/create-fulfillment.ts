/**
 * Adapter call — uses the marketplace factory to create a fulfillment for an
 * unfulfilled Shopify order. Verifies factory → ShopifyApiClient →
 * create-fulfillment → fulfillmentCreateV2 → CreateShipmentResult.
 *
 * Picks the first unfulfilled order from the dev store (or use ORDER_ID).
 *
 * **Write operation against the live dev store.** Creates a real shipment
 * with stub tracking data (`SANDBOX-<timestamp>`). Re-running on the same
 * order errors with "no open fulfillment orders" once everything's
 * fulfilled — pick a different order via ORDER_ID to retry.
 *
 * Required scopes: `read_merchant_managed_fulfillment_orders` and
 * `write_merchant_managed_fulfillment_orders`. If the channel was authorized
 * before these were added, disconnect + reconnect via the dashseller UI.
 *
 * Usage: ORDER_ID=gid://shopify/Order/123 bun run packages/marketplace/sandbox/shopify/adapter/create-fulfillment.ts
 */
import { createApiClient } from "../../../src";
import { getCredentials } from "../setup";

const channelId = process.env.SHOPIFY_CHANNEL_ID;
if (!channelId) {
  console.error(
    "Set SHOPIFY_CHANNEL_ID in sandbox/.env or pass via SHOPIFY_CHANNEL_ID=<id> bun run <this-file>"
  );
  process.exit(1);
}

const creds = await getCredentials(channelId);
const client = createApiClient("shopify", creds);

let orderId = process.env.ORDER_ID;
if (!orderId) {
  const page = await client.getOrders();
  const candidate = page.data.find(
    (o) => !o.shipped && o.status !== "canceled"
  );
  orderId = candidate?.reference;
  if (!orderId) {
    console.error(
      "No unfulfilled, non-canceled order found in the dev store and ORDER_ID not provided."
    );
    process.exit(1);
  }
  console.log(`Using order: ${orderId} (${candidate?.orderNumber})\n`);
}

const order = (await client.getOrders()).data.find(
  (o) => o.reference === orderId
);
if (!order) {
  console.error(`Could not load order ${orderId} from the dev store.`);
  process.exit(1);
}

if (order.orderLines.length === 0) {
  console.error(`Order ${orderId} has no line items.`);
  process.exit(1);
}

const lineItems = order.orderLines.map((line) => ({
  lineItemId: line.reference,
  quantity: line.quantity,
}));

console.log("Calling createFulfillment (adapter)...");
console.log("  carrier=USPS");
console.log(`  lineItems: ${JSON.stringify(lineItems)}`);

const result = await client.createFulfillment(orderId, {
  carrier: "USPS",
  tracking: `SANDBOX-${Date.now()}`,
  lineItems,
});

console.log(`\n✓ Created fulfillment: ${result.fulfillmentId}`);

process.exit(0);
