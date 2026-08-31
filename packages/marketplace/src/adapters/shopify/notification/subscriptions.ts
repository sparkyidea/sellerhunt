import type { SubscriptionResult } from "../../../types";
import { formatGraphQLError } from "../api/helper/format-graphql-error";
import {
  SHOPIFY_API_VERSION,
  type ShopifyAdminClient,
} from "../create-shopify-client";
import {
  fromShopifyGraphqlTopic,
  getSubscribableShopifyTopics,
  type ShopifyTopicSpec,
} from "./topics";

const PAGE_SIZE = 100;

/**
 * `endpoint` is a UNION (`WebhookHttpEndpoint | WebhookEventBridgeEndpoint |
 * WebhookPubSubEndpoint`), so the callback URL is only reachable through an
 * inline fragment. Selecting `endpoint { callbackUrl }` is a validation error.
 */
const SUBSCRIPTIONS_QUERY = `#graphql
  query WebhookSubscriptions($first: Int!, $after: String) {
    webhookSubscriptions(first: $first, after: $after) {
      edges {
        node {
          id
          topic
          apiVersion { handle }
          endpoint {
            ... on WebhookHttpEndpoint { callbackUrl }
          }
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

/**
 * The input field is `uri`; `callbackUrl` was retired from the write side.
 *
 * `WebhookSubscriptionInput` is exactly `{ callbackUrl (deprecated), filter,
 * format, includeFields, metafieldNamespaces, metafields, name, uri }`. Any
 * other key — `apiVersion`, notably — fails variable coercion and takes the
 * whole mutation down with it, silently, on an HTTP 200.
 */
const SUBSCRIPTION_CREATE_MUTATION = `#graphql
  mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`;

const SUBSCRIPTION_UPDATE_MUTATION = `#graphql
  mutation WebhookSubscriptionUpdate($id: ID!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionUpdate(id: $id, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`;

const SUBSCRIPTION_DELETE_MUTATION = `#graphql
  mutation WebhookSubscriptionDelete($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors { field message }
    }
  }
`;

interface WebhookSubscriptionNode {
  /** Read-only — see {@link warnOnApiVersionDrift}. */
  apiVersion: { handle: string } | null;
  /** `{}` for EventBridge/PubSub destinations — not ours, so not touched. */
  endpoint: { callbackUrl?: string } | null;
  id: string;
  /** `WebhookSubscriptionTopic` enum member, e.g. `ORDERS_CREATE`. */
  topic: string;
}

interface SubscriptionsQueryData {
  webhookSubscriptions: {
    edges: Array<{ node: WebhookSubscriptionNode }>;
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };
}

interface UserError {
  field: string[] | null;
  message: string;
}

interface SubscriptionMutationData {
  [key: string]:
    | {
        userErrors: UserError[];
        webhookSubscription: { id: string } | null;
      }
    | undefined;
}

interface SubscriptionDeleteData {
  webhookSubscriptionDelete?: {
    deletedWebhookSubscriptionId: string | null;
    userErrors: UserError[];
  };
}

/** Outcome of one mutation, before it's shaped into a {@link SubscriptionResult}. */
interface MutationOutcome {
  error?: string;
  subscriptionId?: string;
  /**
   * Our access scopes can't hold this topic — a property of the install,
   * not a failure to chase. Rule: CHN-006 — no retry, no escalation, no
   * alert; retrying burns rate limit and hides real failures.
   */
  unavailable?: boolean;
}

/** Loose shape of the client's error envelope; `graphQLErrors` is `any[]` there. */
interface ResponseErrorEnvelope {
  graphQLErrors?: Array<{ extensions?: { code?: string } }>;
  message?: string;
}

function isAccessDenied(errors: ResponseErrorEnvelope | undefined): boolean {
  return (
    errors?.graphQLErrors?.some(
      (error) => error.extensions?.code === "ACCESS_DENIED"
    ) ?? false
  );
}

function formatUserErrors(userErrors: UserError[]): string {
  return userErrors
    .map((error) => `${error.field?.join(".") ?? "(field?)"}: ${error.message}`)
    .join("; ");
}

function getCallbackUrl(node: WebhookSubscriptionNode): string | null {
  return node.endpoint?.callbackUrl ?? null;
}

async function fetchSubscriptionsPage(
  client: ShopifyAdminClient,
  after: string | null
): Promise<SubscriptionsQueryData["webhookSubscriptions"]> {
  const response = await client.request<SubscriptionsQueryData>(
    SUBSCRIPTIONS_QUERY,
    { variables: { first: PAGE_SIZE, after } }
  );
  if (!response.data) {
    throw new Error(
      `Shopify webhookSubscriptions query failed: ${formatGraphQLError(response.errors, "Unknown error")}`
    );
  }
  return response.data.webhookSubscriptions;
}

async function fetchSubscriptions(
  client: ShopifyAdminClient
): Promise<WebhookSubscriptionNode[]> {
  const nodes: WebhookSubscriptionNode[] = [];
  let after: string | null = null;
  do {
    const { edges, pageInfo } = await fetchSubscriptionsPage(client, after);
    nodes.push(...edges.map((edge) => edge.node));
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after);
  return nodes;
}

/**
 * Shopify answers a rejected mutation with HTTP 200 and a `userErrors[]`, so
 * "did it work" is three checks deep: transport, top-level GraphQL errors, then
 * the mutation's own error list.
 */
async function runSubscriptionMutation(args: {
  client: ShopifyAdminClient;
  mutation: string;
  resultKey: string;
  variables: Record<string, unknown>;
}): Promise<MutationOutcome> {
  const response = await args.client.request<SubscriptionMutationData>(
    args.mutation,
    { variables: args.variables }
  );

  const payload = response.data?.[args.resultKey];
  if (!payload) {
    return {
      error: formatGraphQLError(response.errors, "Unknown error"),
      unavailable: isAccessDenied(response.errors),
    };
  }
  if (payload.userErrors.length > 0) {
    return { error: formatUserErrors(payload.userErrors) };
  }
  if (!payload.webhookSubscription) {
    return { error: `${args.resultKey} returned no subscription` };
  }
  return { subscriptionId: payload.webhookSubscription.id };
}

/**
 * `destinationId` is deliberately left undefined: Shopify carries the callback
 * URL on each subscription instead of modelling a shared delivery target, so
 * there is no app-scoped id to report.
 */
function toResult(topic: string, outcome: MutationOutcome): SubscriptionResult {
  if (outcome.subscriptionId) {
    return { status: "enabled", subscriptionId: outcome.subscriptionId, topic };
  }
  return {
    error: outcome.error,
    status: outcome.unavailable ? "unavailable" : "error",
    topic,
  };
}

/**
 * A subscription's payload version is fixed when it is created, from the API
 * version of the request that created it — `WebhookSubscriptionInput` carries no
 * `apiVersion` field, and sending one makes Shopify reject the whole mutation
 * during variable coercion (HTTP 200, `data: null`). Creates therefore land on
 * {@link SHOPIFY_API_VERSION} for free, and drift can only appear on
 * subscriptions an older deploy created.
 *
 * Such drift is reported, not repaired: whether `webhookSubscriptionUpdate`
 * re-versions an existing subscription is unverified, and the only repair we
 * know works — delete and recreate — discards Shopify's queued retries for it.
 * Check `update` against a dev store before automating this.
 */
function warnOnApiVersionDrift(
  node: WebhookSubscriptionNode,
  topic: string
): void {
  const handle = node.apiVersion?.handle;
  if (handle && handle !== SHOPIFY_API_VERSION) {
    console.warn(
      `Shopify webhook subscription ${node.id} (${topic}) still delivers the ${handle} payload shape; expected ${SHOPIFY_API_VERSION}. Delete and recreate it to re-version.`
    );
  }
}

/**
 * Bring one topic to the desired state. An existing subscription is re-pointed
 * IN PLACE rather than deleted and recreated: a delete drops Shopify's queued
 * retries for that subscription, so a redeploy during an outage would discard
 * exactly the deliveries we were trying to preserve.
 *
 * The callback URL is the only thing this repairs; see
 * {@link warnOnApiVersionDrift} for why a stale payload version is not.
 */
async function reconcileTopic(args: {
  client: ShopifyAdminClient;
  endpoint: string;
  existing: WebhookSubscriptionNode | undefined;
  spec: ShopifyTopicSpec;
}): Promise<SubscriptionResult> {
  const { client, endpoint, existing, spec } = args;
  const webhookSubscription = { uri: endpoint };

  try {
    if (!existing) {
      return toResult(
        spec.topic,
        await runSubscriptionMutation({
          client,
          mutation: SUBSCRIPTION_CREATE_MUTATION,
          resultKey: "webhookSubscriptionCreate",
          variables: { topic: spec.graphqlTopic, webhookSubscription },
        })
      );
    }

    warnOnApiVersionDrift(existing, spec.topic);

    if (getCallbackUrl(existing) === endpoint) {
      return {
        status: "enabled",
        subscriptionId: existing.id,
        topic: spec.topic,
      };
    }

    return toResult(
      spec.topic,
      await runSubscriptionMutation({
        client,
        mutation: SUBSCRIPTION_UPDATE_MUTATION,
        resultKey: "webhookSubscriptionUpdate",
        variables: { id: existing.id, webhookSubscription },
      })
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error",
      status: "error",
      topic: spec.topic,
    };
  }
}

/** Delete a subscription we no longer want. Reports failure rather than throwing. */
async function removeSubscription(
  client: ShopifyAdminClient,
  node: WebhookSubscriptionNode
): Promise<SubscriptionResult> {
  // Topics outside our catalogue have no header spelling to report, so the
  // GraphQL enum stands in — it's the only name we have for them.
  const topic = fromShopifyGraphqlTopic(node.topic) ?? node.topic;
  try {
    const response = await client.request<SubscriptionDeleteData>(
      SUBSCRIPTION_DELETE_MUTATION,
      { variables: { id: node.id } }
    );
    const payload = response.data?.webhookSubscriptionDelete;
    if (!payload) {
      return {
        error: formatGraphQLError(response.errors, "Unknown error"),
        status: isAccessDenied(response.errors) ? "unavailable" : "error",
        topic,
      };
    }
    if (payload.userErrors.length > 0) {
      return {
        error: formatUserErrors(payload.userErrors),
        status: "error",
        topic,
      };
    }
    return { status: "removed", subscriptionId: node.id, topic };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error",
      status: "error",
      topic,
    };
  }
}

/**
 * Reconcile a shop's webhook subscriptions with
 * {@link getSubscribableShopifyTopics}: create/repair what we want, delete what
 * we don't. Called with the shop's access token at connect; safe to re-run, and
 * re-run by the health cron.
 *
 * `subscriptionId` is the full gid — Shopify's mutations take an `ID!`, so
 * storing the stripped numeric form would mean re-wrapping it on every write.
 */
export async function reconcileShopifySubscriptions(
  client: ShopifyAdminClient,
  endpoint: string
): Promise<SubscriptionResult[]> {
  const specs = getSubscribableShopifyTopics();
  const existing = await fetchSubscriptions(client);

  const byTopic = new Map<string, WebhookSubscriptionNode>();
  for (const node of existing) {
    const topic = fromShopifyGraphqlTopic(node.topic);
    if (topic) {
      byTopic.set(topic, node);
    }
  }

  const results: SubscriptionResult[] = [];
  for (const spec of specs) {
    // Sequential: this runs inside the OAuth callback, and a burst of mutations
    // is the fastest way to spend the shop's GraphQL cost budget on a retry.
    results.push(
      await reconcileTopic({
        client,
        endpoint,
        existing: byTopic.get(spec.topic),
        spec,
      })
    );
  }

  const desired = new Set(specs.map((spec) => spec.topic));
  for (const node of existing) {
    const topic = fromShopifyGraphqlTopic(node.topic);
    // Only ever delete deliveries pointed at THIS endpoint. A merchant's own
    // subscriptions, and our other environments' (staging shares the shop),
    // are invisible to this reconcile by construction.
    if ((topic && desired.has(topic)) || getCallbackUrl(node) !== endpoint) {
      continue;
    }
    results.push(await removeSubscription(client, node));
  }

  return results;
}

/**
 * Delete every webhook subscription this app holds on the shop.
 *
 * The counterpart to {@link reconcileShopifySubscriptions}, for when a channel
 * is removed. Unlike the reconcile path this does NOT filter by callback URL:
 * the query only ever returns subscriptions created with our client id, and at
 * disconnect we want them all gone — including ones an older endpoint left
 * behind, which are otherwise unreachable once the token is revoked.
 */
export async function removeShopifySubscriptions(
  client: ShopifyAdminClient
): Promise<SubscriptionResult[]> {
  const existing = await fetchSubscriptions(client);

  const results: SubscriptionResult[] = [];
  for (const node of existing) {
    results.push(await removeSubscription(client, node));
  }
  return results;
}
