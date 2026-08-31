import { createAppClient } from "@dashseller/marketplace";
import type {
  AppConfig,
  NotificationEventType,
} from "@dashseller/marketplace/types";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** The marketplaces this receiver accepts deliveries for. */
export type WebhookMarketplace = "ebay" | "shopify";

/**
 * Event types the receiver enqueues domain jobs for. Everything else —
 * authentic deliveries included — is ACKed without a job: there is no
 * inbox in this design, so an unhandled event costs nothing and leaves
 * nothing behind (eBay redelivers, and the windowed pulls are the safety
 * net for anything a lost delivery could have carried).
 */
export const HANDLED_EVENT_TYPES: ReadonlySet<NotificationEventType> = new Set([
  "order.created",
  "order.updated",
  "order.shipped",
  "order.canceled",
  "order.delivered",
  "listing.created",
  "listing.updated",
  "listing.deleted",
  "account.closed",
  "authorization.revoked",
]);

/**
 * What a marketplace expects to see on the wire. Every status the receiver
 * can emit is chosen here, because "what does a 500 cost us" is a
 * per-marketplace question and the pipeline that answers requests must not
 * have to know.
 */
export interface WebhookPolicy {
  /** Success. eBay's SDK samples expect an empty 204; Shopify wants any 2xx. */
  ack: 200 | 204;
  /**
   * Answer the endpoint-validation handshake. Absent for marketplaces that
   * never challenge — the GET route 404s for those rather than inventing a
   * body.
   */
  answerChallenge?: (args: {
    challengeCode: string;
    endpoint: string;
  }) => Record<string, string>;
  /** How long we let the enqueue run before answering anyway. */
  enqueueBudgetMs: number;
  enqueueFailed: ContentfulStatusCode;
  /** Payload exceeded the size cap. */
  payloadTooLarge: ContentfulStatusCode;
  /** Signature/HMAC did not verify. */
  rejected: ContentfulStatusCode;
  /** Channel resolution (a database read) failed. */
  resolutionFailed: ContentfulStatusCode;
  /** Verification could not be performed at all (signing-key fetch failed). */
  unavailable: ContentfulStatusCode;
}

export type WebhookPolicies = Record<WebhookMarketplace, WebhookPolicy>;

/** Process concerns the policies close over — injected by the shell. */
export interface WebhookPolicyDeps {
  ebayVerificationToken: string;
  getAppCredentials: (marketplaceId: WebhookMarketplace) => AppConfig;
}

/**
 * Build the per-marketplace policy record. A factory (not a constant)
 * because eBay's challenge answer needs app credentials and the shared
 * verification token — process concerns the worker injects, exactly like
 * everything else in this app.
 *
 * A marketplace absent from the record has no endpoint at all —
 * `/webhook/<it>` 404s. This is the only file that names marketplaces.
 */
export function createWebhookPolicies(
  deps: WebhookPolicyDeps
): WebhookPolicies {
  /**
   * eBay's `answerChallenge` is optional on `AppClient` because most
   * marketplaces have no handshake. Throwing when it's missing beats
   * falling back to an empty body, which eBay would silently score as a
   * failed hash.
   */
  const answerEbayChallenge = (args: {
    challengeCode: string;
    endpoint: string;
  }): Record<string, string> => {
    const client = createAppClient("ebay", deps.getAppCredentials("ebay"));
    if (!client.answerChallenge) {
      throw new Error("eBay app client cannot answer challenges");
    }
    return client.answerChallenge({
      challengeCode: args.challengeCode,
      endpoint: args.endpoint,
      verificationToken: deps.ebayVerificationToken,
    });
  };

  return {
    /**
     * eBay redelivers on any non-2xx (up to 3 attempts), so every failure
     * before the job is safely enqueued returns 5xx to spend one of them.
     * 412 mirrors eBay's own SDK convention for a signature mismatch — and
     * unlike the 5xx cases it is deliberately NOT worth a retry, since a
     * forged or wrong-keyset delivery will fail identically next time.
     */
    ebay: {
      ack: 204,
      answerChallenge: answerEbayChallenge,
      enqueueBudgetMs: 10_000,
      enqueueFailed: 500,
      payloadTooLarge: 413,
      rejected: 412,
      resolutionFailed: 500,
      unavailable: 500,
    },
    /**
     * Shopify answers 200 to everything except a bad HMAC, which reads
     * backwards until you price the alternative.
     *
     * Shopify DELETES an API-created subscription after 8 consecutive
     * non-2xx deliveries, and announces it by emailing the app's emergency
     * contact — nothing lands in our logs, no channel is marked unhealthy.
     * So on a dependency outage, 5xx loses the events AND the subscription,
     * silently and permanently; 200 loses only the events, and the windowed
     * pulls re-cover those on the next tick. Losing events self-heals.
     * Losing the subscription does not.
     *
     * The budget is 2.5s because Shopify hangs up at 5s and counts that as
     * one of the eight.
     *
     * A failed HMAC is the exception: that request did not come from
     * Shopify, or our secret is wrong. 401 is the honest answer and the one
     * worth alerting on.
     */
    shopify: {
      ack: 200,
      enqueueBudgetMs: 2500,
      enqueueFailed: 200,
      payloadTooLarge: 413,
      rejected: 401,
      resolutionFailed: 200,
      unavailable: 200,
    },
  };
}

/**
 * Membership in the policy record is what proves a route param is a
 * marketplace we serve — the record's keys are exactly that union, so this
 * guard is the receiver's only contact with marketplace names.
 *
 * `Object.hasOwn`, not `in`: the param is attacker-controlled, and `in`
 * also answers true for inherited `Object.prototype` keys, so
 * `/webhook/toString` would narrow to a supported marketplace and hand a
 * Function to code expecting a {@link WebhookPolicy}.
 */
function isSupportedMarketplace(
  policies: WebhookPolicies,
  value: string
): value is WebhookMarketplace {
  return Object.hasOwn(policies, value);
}

/**
 * Resolve a `/webhook/:marketplace` param. Null means we don't accept
 * deliveries for it, which the routes answer with 404.
 */
export function getWebhookPolicy(
  policies: WebhookPolicies,
  marketplace: string
): { marketplaceId: WebhookMarketplace; policy: WebhookPolicy } | null {
  if (!isSupportedMarketplace(policies, marketplace)) {
    return null;
  }
  return { marketplaceId: marketplace, policy: policies[marketplace] };
}
