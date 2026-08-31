import type { Database } from "@dashseller/db/client";
import { channel, webhookDelivery } from "@dashseller/db/schema";
import type {
  DeliveryContext,
  JobClient,
  WebhookEnvelope,
} from "@dashseller/job-client";
import { createAppClient } from "@dashseller/marketplace";
import type {
  AppConfig,
  NotificationEvent,
  VerifyNotificationInput,
} from "@dashseller/marketplace/types";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Context } from "hono";
import {
  getWebhookPolicy,
  HANDLED_EVENT_TYPES,
  type WebhookMarketplace,
  type WebhookPolicies,
  type WebhookPolicy,
} from "./policy";

/**
 * 1 MB — nothing a marketplace legitimately delivers comes close. Also
 * enforced as the Bun server's `maxRequestBodySize`: the in-handler checks
 * below trust `content-length` and then buffer, so only the server layer
 * can stop a chunked or lying request from occupying memory first.
 */
export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Reject once `ms` elapses. The enqueue itself is left running — this
 * bounds how long the marketplace waits for our answer, not how long the
 * enqueue takes; the fenced job ids / dedup make a late-landing enqueue
 * harmless.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Timed out after ${ms}ms`)),
        ms
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

export interface ResolvedChannel {
  archived: boolean;
  connected: boolean;
  connectionGeneration: string;
  enabled: boolean;
  id: string;
}

/** The dispatcher's `eligibleChannels` predicate, applied per delivery. */
function isSyncEligible(resolved: ResolvedChannel): boolean {
  return resolved.connected && resolved.enabled && !resolved.archived;
}

/**
 * Attribute an event to a channel from the payload alone, capturing the
 * CURRENT connection generation — the value a disconnect job will be
 * fenced on. Null when nothing matches (an account that never connected
 * to us) — expected, not an error.
 */
async function resolveChannel(
  db: Database,
  marketplaceId: WebhookMarketplace,
  event: NotificationEvent
): Promise<ResolvedChannel | null> {
  // `reference` is the immutable marketplace user id, so prefer it;
  // `displayName` is mutable and only used when no id matched.
  for (const [column, values] of [
    [channel.reference, event.channelRefs],
    [channel.displayName, event.channelNames],
  ] as const) {
    if (values.length === 0) {
      continue;
    }
    const [match] = await db
      .select({
        id: channel.id,
        archived: channel.archived,
        connected: channel.connected,
        connectionGeneration: channel.connectionGeneration,
        enabled: channel.enabled,
      })
      .from(channel)
      .where(
        and(eq(channel.marketplaceId, marketplaceId), inArray(column, values))
      )
      .limit(1);
    if (match) {
      return {
        id: match.id,
        archived: match.archived,
        connected: match.connected === true,
        connectionGeneration: match.connectionGeneration,
        enabled: match.enabled,
      };
    }
  }
  console.warn(
    `${marketplaceId} webhook: unattributed event`,
    event.topic,
    event.channelRefs,
    event.channelNames
  );
  return null;
}

export interface WebhookReceiverDeps {
  db: Database;
  getAppCredentials: (marketplaceId: WebhookMarketplace) => AppConfig;
  jobs: JobClient;
  /** Test seam — defaults to the fire-and-forget `webhook_delivery` upsert. */
  persistDelivery?: (record: DeliveryRecord) => void;
  policies: WebhookPolicies;
  /** Test seam — defaults to the channel lookup against `deps.db`. */
  resolveChannel?: (
    marketplaceId: WebhookMarketplace,
    event: NotificationEvent
  ) => Promise<ResolvedChannel | null>;
  /** Test seam — defaults to `createAppClient(...).verifyNotification`. */
  verifyNotification?: (
    marketplaceId: WebhookMarketplace,
    input: VerifyNotificationInput
  ) => Promise<NotificationEvent | null>;
}

export type DeliveryOutcome =
  | "enqueued"
  | "enqueue_failed"
  | "ignored"
  | "ineligible"
  | "unattributed";

/** A verified delivery's disposition, destined for the `webhook_delivery` log. */
export interface DeliveryRecord {
  channelId?: string;
  event: NotificationEvent;
  marketplace: WebhookMarketplace;
  outcome: DeliveryOutcome;
  payload: unknown;
}

/**
 * Fire-and-forget upsert into the delivery log. Deliberately not awaited:
 * the log must never fail a delivery, delay an ACK, or gate an enqueue —
 * the unique (marketplace, deliveryId) upsert makes redeliveries bump
 * `attempts` instead of double-writing.
 */
function defaultPersistDelivery(
  db: Database
): (record: DeliveryRecord) => void {
  return (record) => {
    db.insert(webhookDelivery)
      .values({
        marketplace: record.marketplace,
        deliveryId: record.event.externalEventId,
        topic: record.event.topic,
        eventType: record.event.eventType,
        resourceId: record.event.resourceId ?? null,
        channelId: record.channelId ?? null,
        outcome: record.outcome,
        payload: record.payload,
      })
      .onConflictDoUpdate({
        target: [webhookDelivery.marketplace, webhookDelivery.deliveryId],
        set: {
          outcome: record.outcome,
          channelId: record.channelId ?? null,
          attempts: sql`${webhookDelivery.attempts} + 1`,
          lastSeenAt: new Date(),
        },
      })
      .catch((error: unknown) => {
        console.error(
          `${record.marketplace} webhook: delivery log write failed`,
          error
        );
      });
  };
}

/**
 * One line per verified delivery — for live tailing; the queryable record
 * is the `webhook_delivery` table.
 */
function logDelivery(
  marketplaceId: WebhookMarketplace,
  outcome: DeliveryOutcome,
  event: NotificationEvent,
  channelId?: string
): void {
  console.log(
    JSON.stringify({
      level: "info",
      message: "webhook delivery",
      time: new Date().toISOString(),
      marketplace: marketplaceId,
      outcome,
      topic: event.topic,
      eventType: event.eventType,
      deliveryId: event.externalEventId,
      resourceId: event.resourceId ?? null,
      channelId: channelId ?? null,
    })
  );
}

function buildEnvelope(
  marketplaceId: WebhookMarketplace,
  event: NotificationEvent,
  resolved: ResolvedChannel
): WebhookEnvelope {
  return {
    schemaVersion: 1,
    provider: marketplaceId,
    eventType: event.eventType,
    externalDeliveryId: event.externalEventId,
    externalResourceId: event.resourceId,
    channelId: resolved.id,
    connectionGeneration: resolved.connectionGeneration,
    receivedAt: new Date().toISOString(),
    providerEventAt: event.occurredAt?.toISOString() ?? null,
  };
}

/**
 * Route a verified, attributed event to its domain job. Fetch-latest
 * semantics throughout: jobs carry the resource identity, never payload
 * state — the worker refetches from the marketplace, so ordering across
 * deliveries is the domain's stale guards' problem, not the queue's.
 */
async function enqueueDomainJob(params: {
  deps: WebhookReceiverDeps;
  event: NotificationEvent;
  marketplaceId: WebhookMarketplace;
  resolved: ResolvedChannel;
}): Promise<void> {
  const { deps, event, marketplaceId, resolved } = params;
  const envelope = buildEnvelope(marketplaceId, event, resolved);
  const delivery: DeliveryContext = {
    marketplace: marketplaceId,
    deliveryId: event.externalEventId,
  };
  const channelId = resolved.id;

  switch (event.eventType) {
    case "account.closed":
    case "authorization.revoked":
      await deps.jobs.enqueueDisconnectChannel(
        {
          channelId,
          connectionGeneration: resolved.connectionGeneration,
          reason: `${marketplaceId} ${event.topic}`,
          envelope,
        },
        delivery
      );
      return;
    case "order.created":
    case "order.updated":
    case "order.shipped":
    case "order.canceled":
    case "order.delivered":
      if (event.resourceId) {
        await deps.jobs.enqueueSyncOrder(
          { channelId, orderReference: event.resourceId, envelope },
          delivery
        );
      } else {
        // No order id in the payload — fall back to a windowed pull.
        await deps.jobs.enqueueSyncChannelOrders({
          channelId,
          forceRefresh: false,
        });
      }
      return;
    case "listing.deleted":
      if (event.resourceId && envelope.providerEventAt) {
        await deps.jobs.enqueueArchiveListing(
          {
            channelId,
            listingReference: event.resourceId,
            // Tombstone clock: X-Shopify-Triggered-At (required for
            // Shopify per the version-clock rules).
            tombstoneVersionAt: envelope.providerEventAt,
            envelope,
          },
          delivery
        );
      } else {
        // Without a resource id or a provider clock the tombstone can't be
        // ordered against updates — a channel pull re-derives the state and
        // full reconciliation recovers the delete.
        console.warn(
          `${marketplaceId} webhook: listing.deleted without id/clock — falling back to channel pull`,
          event.topic
        );
        await deps.jobs.enqueueSyncChannelListings(
          { channelId, forceRefresh: false },
          delivery
        );
      }
      return;
    case "listing.created":
    case "listing.updated":
      await deps.jobs.enqueueSyncChannelListings(
        { channelId, forceRefresh: false },
        delivery
      );
      return;
    default:
      // Guarded by HANDLED_EVENT_TYPES before we get here.
      return;
  }
}

function readSizeCappedBody(
  c: Context,
  policy: WebhookPolicy
): Promise<string> | Response {
  const contentLength = Number.parseInt(
    c.req.header("content-length") ?? "0",
    10
  );
  if (contentLength > MAX_BODY_BYTES) {
    return c.text("Payload too large", policy.payloadTooLarge);
  }
  // Read once: `.text()` consumes the stream and a second call throws.
  return c.req.text();
}

async function verifyDelivery(params: {
  c: Context;
  marketplaceId: WebhookMarketplace;
  policy: WebhookPolicy;
  rawBody: string;
  verify: NonNullable<WebhookReceiverDeps["verifyNotification"]>;
}): Promise<NotificationEvent | Response> {
  const { c, marketplaceId, policy, rawBody } = params;
  // The fetch spec lower-cases header names, which is the casing
  // `VerifyNotificationInput` promises adapters.
  const headers = Object.fromEntries(c.req.raw.headers);
  let event: NotificationEvent | null;
  try {
    event = await params.verify(marketplaceId, { headers, rawBody });
  } catch (error) {
    console.error(`${marketplaceId} webhook: verification unavailable`, error);
    return c.text("Verification unavailable", policy.unavailable);
  }
  if (!event) {
    console.warn(
      `${marketplaceId} webhook: delivery rejected — signature mismatch`
    );
    return c.text("Signature mismatch", policy.rejected);
  }
  return event;
}

/** Verified-but-non-JSON bodies are kept verbatim rather than dropped. */
function parseDeliveryPayload(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

/** Disposition of a verified event: resolve the channel, gate, enqueue, ACK. */
async function routeVerifiedEvent(params: {
  c: Context;
  deps: WebhookReceiverDeps;
  event: NotificationEvent;
  marketplaceId: WebhookMarketplace;
  persist: (record: DeliveryRecord) => void;
  policy: WebhookPolicy;
  rawBody: string;
  resolve: NonNullable<WebhookReceiverDeps["resolveChannel"]>;
}): Promise<Response> {
  const { c, deps, event, marketplaceId, persist, policy } = params;
  const payload = parseDeliveryPayload(params.rawBody);
  const track = (outcome: DeliveryOutcome, channelId?: string): void => {
    logDelivery(marketplaceId, outcome, event, channelId);
    persist({ marketplace: marketplaceId, event, outcome, channelId, payload });
  };

  if (!HANDLED_EVENT_TYPES.has(event.eventType)) {
    track("ignored");
    return c.body(null, policy.ack);
  }

  // Channel resolution is a database read — a Postgres outage answers
  // with the policy's resolution status (500 for eBay to spend a
  // redelivery, 200 for Shopify to protect the subscription).
  let resolved: ResolvedChannel | null;
  try {
    resolved = await params.resolve(marketplaceId, event);
  } catch (error) {
    console.error(`${marketplaceId} webhook: channel resolution failed`, error);
    return c.text("Resolution failed", policy.resolutionFailed);
  }

  // Unattributed events have nothing to act on. Domain jobs require the
  // same eligibility the dispatcher's `eligibleChannels` enforces —
  // connected AND enabled AND not archived — so a delivery can't run a
  // sync the user has paused or archived. Disconnect events BYPASS the
  // gate entirely: an uninstall for an already-disconnected channel
  // still no-ops safely in the worker, but a disconnect suppressed by
  // the gate would never fire at all.
  const isDisconnect =
    event.eventType === "account.closed" ||
    event.eventType === "authorization.revoked";
  if (!(resolved && (isDisconnect || isSyncEligible(resolved)))) {
    track(resolved ? "ineligible" : "unattributed", resolved?.id);
    return c.body(null, policy.ack);
  }

  try {
    await withTimeout(
      enqueueDomainJob({ deps, event, marketplaceId, resolved }),
      policy.enqueueBudgetMs
    );
  } catch (error) {
    // Fail-fast producer: Redis down rejects immediately. The policy
    // decides what that costs — eBay gets a 5xx (spend a redelivery),
    // Shopify gets a 200 (protect the subscription; the windowed pull
    // re-covers the event).
    console.error(`${marketplaceId} webhook: enqueue failed`, error);
    persist({
      marketplace: marketplaceId,
      event,
      outcome: "enqueue_failed",
      channelId: resolved.id,
      payload,
    });
    return c.text("Enqueue failed", policy.enqueueFailed);
  }

  track("enqueued", resolved.id);
  return c.body(null, policy.ack);
}

/**
 * All inbound marketplace deliveries. Contract: cap the size, verify the
 * signature over the raw body, resolve the channel (capturing the
 * connection generation), enqueue the domain job, ACK. No inbox — Redis
 * durability plus the periodic sweeps/windowed pulls are the recovery
 * story; the fail-fast producer makes a Redis outage visible as the
 * policy's enqueue-failed status instead of a silent drop.
 */
export function createReceiveHandler(deps: WebhookReceiverDeps) {
  const verify =
    deps.verifyNotification ??
    ((marketplaceId: WebhookMarketplace, input: VerifyNotificationInput) =>
      createAppClient(
        marketplaceId,
        deps.getAppCredentials(marketplaceId)
      ).verifyNotification(input));
  const resolve =
    deps.resolveChannel ??
    ((marketplaceId: WebhookMarketplace, event: NotificationEvent) =>
      resolveChannel(deps.db, marketplaceId, event));
  const persist = deps.persistDelivery ?? defaultPersistDelivery(deps.db);

  return async function receiveNotification(c: Context): Promise<Response> {
    const resolvedPolicy = getWebhookPolicy(
      deps.policies,
      c.req.param("marketplace") ?? ""
    );
    if (!resolvedPolicy) {
      return c.notFound();
    }
    const { marketplaceId, policy } = resolvedPolicy;

    const bodyOrResponse = readSizeCappedBody(c, policy);
    if (bodyOrResponse instanceof Response) {
      return bodyOrResponse;
    }
    const rawBody = await bodyOrResponse;
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return c.text("Payload too large", policy.payloadTooLarge);
    }

    const eventOrResponse = await verifyDelivery({
      c,
      marketplaceId,
      policy,
      rawBody,
      verify,
    });
    if (eventOrResponse instanceof Response) {
      return eventOrResponse;
    }
    return routeVerifiedEvent({
      c,
      deps,
      event: eventOrResponse,
      marketplaceId,
      persist,
      policy,
      rawBody,
      resolve,
    });
  };
}
