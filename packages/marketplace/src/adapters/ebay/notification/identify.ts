import { extractEbayOrderContext } from "./payloads/order-confirmation";

/**
 * Who and what an inbound notification is about, resolved from the payload
 * alone (no database access).
 *
 * Seller identity is returned as two candidate lists because eBay's `userId`
 * field means different things per topic — ORDER_CONFIRMATION's is the opaque
 * account id (`y9qonyvfrqq`, our `channel.reference`) while FEEDBACK_*'s is the
 * human username (`mcd-toy`, our `channel.displayName`). Callers try
 * `reference` first, then `displayName`.
 *
 * The name list is a WEAK key: usernames are mutable and re-registerable, and
 * nothing refreshes `channel.displayName` after connect, so a match can land on
 * a different tenant's channel. Topics whose worst case is a redundant re-sync
 * of a channel using its own token can afford that; topics that drive a
 * destructive write cannot, and publish refs only — see {@link identifyUser}.
 */
export interface EbayEventIdentity {
  /** Candidates for `channel.displayName` (eBay username). */
  channelNames: string[];
  /** Candidates for `channel.reference` (opaque eBay user id). */
  channelRefs: string[];
  /** Primary entity in the payload, for tracing. Never load-bearing. */
  resourceId: string | null;
}

const EMPTY: EbayEventIdentity = {
  channelRefs: [],
  channelNames: [],
  resourceId: null,
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Feedback payloads carry two parties — `feedbackDetail.providerUserDetail`
 * (who left it) and `receiverUserDetail` (who got it), each tagged with a
 * `role`. Which one is us flips between FEEDBACK_LEFT and FEEDBACK_RECEIVED,
 * so select on `role === "SELLER"` rather than on position.
 */
function identifyFeedback(data: Record<string, unknown>): EbayEventIdentity {
  const detail = asRecord(data.feedbackDetail);
  const parties = [
    asRecord(detail?.providerUserDetail),
    asRecord(detail?.receiverUserDetail),
    asRecord(data.providerUserDetail),
    asRecord(data.receiverUserDetail),
  ].filter((p): p is Record<string, unknown> => p !== null);

  const sellerIds = parties
    .filter((p) => asString(p.role)?.toUpperCase() === "SELLER")
    .map((p) => asString(p.userId))
    .filter((v): v is string => v !== null);

  const lineItem = asRecord(detail?.orderLineItemSummary);

  return {
    // Observed as the username, but listed in both for the reason above.
    channelRefs: sellerIds,
    channelNames: sellerIds,
    resourceId:
      asString(detail?.feedbackId) ??
      asString(lineItem?.orderLineItemId) ??
      asString(lineItem?.listingId),
  };
}

function identifyOrderConfirmation(
  data: Record<string, unknown>
): EbayEventIdentity {
  const { orderId, sellerUserIds, sellerUsernames } =
    extractEbayOrderContext(data);
  return {
    channelRefs: sellerUserIds,
    channelNames: sellerUsernames,
    resourceId: orderId,
  };
}

/**
 * Account deletion and authorization revocation both identify the user flatly.
 *
 * `channelNames` stays empty on purpose. These two topics are the only ones that
 * drive a destructive write — the channel is disabled and its
 * `channel_webhook_subscription` rows are deleted — and eBay broadcasts account
 * deletions for users who never authorized us, so a username match on a stale or
 * re-registered `displayName` would tear down an unrelated tenant's channel.
 * `userId` is always present here, so the weak key buys nothing anyway. Same
 * stance the Shopify adapter's `identifyShopifyEvent` documents.
 */
function identifyUser(data: Record<string, unknown>): EbayEventIdentity {
  const userId = asString(data.userId);
  return {
    channelRefs: userId ? [userId] : [],
    channelNames: [],
    resourceId: userId,
  };
}

/** Payload nests everything under `itemMarkedShipped`. Verified 2026-08-05. */
function identifyItemMarkedShipped(
  data: Record<string, unknown>
): EbayEventIdentity {
  const shipped = asRecord(data.itemMarkedShipped) ?? data;
  return {
    channelRefs: [asString(shipped.publicUserId)].filter(
      (v): v is string => v !== null
    ),
    channelNames: [asString(shipped.username)].filter(
      (v): v is string => v !== null
    ),
    resourceId: asString(shipped.orderId) ?? asString(shipped.itemId),
  };
}

/**
 * Messaging payloads carry usernames only — no opaque id — so attribution
 * depends on `channel.displayName`, which sellers can change.
 *
 * BUYER_QUESTION is always buyer→seller, so the recipient is us. NEW_MESSAGE
 * runs both directions, so both parties are offered as candidates.
 *
 * Both casings are read because eBay's own payloads disagree: the portal's test
 * notifications send `senderUserName`/`recipientUserName`, while a real
 * NEW_MESSAGE delivery (observed 2026-08-06) sends `senderUsername`. Platform
 * announcements (`conversationType: "FROM_EBAY"`) carry no recipient field at
 * all and so stay unattributed — expected, not a failure.
 */
function identifyMessage(includeSender: boolean) {
  return (data: Record<string, unknown>): EbayEventIdentity => ({
    channelRefs: [],
    channelNames: [
      asString(data.recipientUserName),
      asString(data.recipientUsername),
      includeSender ? asString(data.senderUserName) : null,
      includeSender ? asString(data.senderUsername) : null,
    ].filter((v): v is string => v !== null),
    resourceId: asString(data.messageId) ?? asString(data.conversationId),
  });
}

const IDENTIFIERS: Record<
  string,
  (data: Record<string, unknown>) => EbayEventIdentity
> = {
  ITEM_MARKED_SHIPPED: identifyItemMarkedShipped,
  BUYER_QUESTION: identifyMessage(false),
  NEW_MESSAGE: identifyMessage(true),
  ORDER_CONFIRMATION: identifyOrderConfirmation,
  MARKETPLACE_ACCOUNT_DELETION: identifyUser,
  // Payload shape assumed to match account deletion — unverified against a real
  // delivery. Wrong guesses yield an unattributed row, not a failure.
  AUTHORIZATION_REVOCATION: identifyUser,
  FEEDBACK_LEFT: identifyFeedback,
  FEEDBACK_RECEIVED: identifyFeedback,
  FEEDBACK_STAR_RATING: identifyFeedback,
};

/**
 * Resolve seller candidates and a tracing id for any topic.
 *
 * Runs at RECEIVE time, before the inbox insert, so `channel_id` and
 * `resource_id` are populated for every event — including topics with no
 * handler, which are filed as `ignored` and would otherwise never be
 * attributable to a channel without re-parsing JSON.
 *
 * Unknown topics yield empty candidates rather than throwing: an
 * unattributed row still beats a rejected delivery.
 */
export function identifyEbayEvent(
  topic: string,
  data: Record<string, unknown>
): EbayEventIdentity {
  return IDENTIFIERS[topic]?.(data) ?? EMPTY;
}
