/**
 * eBay Notification API doctor — shows what eBay ACTUALLY has registered
 * (destinations + this seller's subscriptions) and can fire eBay's official
 * test notification: eBay sends a real, signed sample event to whatever
 * endpoint the destination currently points at. The receiver can't tell it
 * from a production delivery, so this proves the whole delivery loop.
 *
 * Usage:
 *   bun run packages/marketplace/sandbox/ebay/direct-api/notification-status.ts
 *   bun run ... notification-status.ts --test ORDER_CONFIRMATION
 *
 * Env: EBAY_CHANNEL_ID from sandbox/.env; DATABASE_URL, ENCRYPTION_SECRET,
 * EBAY_CLIENT_ID/SECRET from apps/api/.env — override DATABASE_URL on the
 * command line to point at the DB the deployed worker uses.
 */
import {
  createEbayApiClient,
  createEbayAppClient,
} from "../../../src/adapters/ebay/create-ebay-client";
import { getCredentials } from "../setup";

const channelId = process.env.EBAY_CHANNEL_ID;
if (!channelId) {
  console.error("Set EBAY_CHANNEL_ID in sandbox/.env");
  process.exit(1);
}

const testIndex = process.argv.indexOf("--test");
const testTopic = testIndex >= 0 ? process.argv[testIndex + 1] : undefined;

const creds = await getCredentials(channelId);
const userClient = createEbayApiClient(
  creds.clientId,
  creds.clientSecret,
  creds.accessToken,
  creds.refreshToken
);
const appClient = createEbayAppClient(creds.clientId, creds.clientSecret);

interface DestinationRecord {
  deliveryConfig?: { endpoint?: string };
  destinationId?: string;
  name?: string;
  status?: string;
}

interface SubscriptionRecord {
  destinationId?: string;
  status?: string;
  subscriptionId?: string;
  topicId?: string;
}

const destinationsResponse =
  (await appClient.commerce.notification.getDestinations({ limit: "100" })) as {
    destinations?: DestinationRecord[];
  };
const destinations = destinationsResponse.destinations ?? [];

console.log("=== Destinations (app-scoped) ===");
for (const d of destinations) {
  console.log(
    `  ${d.status?.padEnd(8)} ${d.name}  →  ${d.deliveryConfig?.endpoint}  (${d.destinationId})`
  );
}

const subscriptionsResponse =
  (await userClient.commerce.notification.getSubscriptions({
    limit: "100",
  })) as { subscriptions?: SubscriptionRecord[] };
const subscriptions = subscriptionsResponse.subscriptions ?? [];

const destinationById = new Map(
  destinations.map((d) => [d.destinationId, d] as const)
);

console.log("\n=== Subscriptions (this seller) ===");
for (const s of subscriptions) {
  const destination = s.destinationId
    ? destinationById.get(s.destinationId)
    : undefined;
  const target = destination
    ? destination.deliveryConfig?.endpoint
    : `UNKNOWN DESTINATION ${s.destinationId}`;
  console.log(
    `  ${s.status?.padEnd(8)} ${s.topicId?.padEnd(30)} →  ${target}  (${s.subscriptionId})`
  );
}

if (testTopic) {
  const subscription = subscriptions.find(
    (s) => s.topicId === testTopic || s.subscriptionId === testTopic
  );
  if (!subscription?.subscriptionId) {
    console.error(`\nNo subscription found for "${testTopic}"`);
    process.exit(1);
  }
  console.log(`\nFiring test notification for ${subscription.topicId}...`);
  const result = await userClient.commerce.notification.testSubscription(
    subscription.subscriptionId
  );
  console.log("Accepted by eBay:", result ?? "(empty response — accepted)");
  console.log(
    "Watch the worker: an ORDER_CONFIRMATION sample usually logs " +
      "'unattributed event' (placeholder seller) or enqueues a sync-order " +
      "job visible in Bull Board."
  );
}

process.exit(0);
