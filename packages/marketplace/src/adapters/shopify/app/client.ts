import type {
  AppConfig,
  NotificationEvent,
  VerifyNotificationInput,
} from "../../../types";
import type { AppClient } from "../../base";
import { getSubscribableShopifyTopics } from "../notification/topics";
import { verifyNotification } from "./verify-notification";

/**
 * Shopify application adapter for app-scoped operations.
 *
 * Holds the client secret and nothing else. There is no `clientId` field
 * because Shopify has no app-token exchange and no public-key endpoint — every
 * webhook is authenticated with the secret alone, so the id would be dead
 * state that reads like a credential.
 *
 * {@link AppClient.answerChallenge} and {@link AppClient.reconcileDestination}
 * are absent rather than stubbed: Shopify neither challenges the endpoint nor
 * models it as a separate object, and a no-op implementation would make callers
 * feature-detect on behaviour instead of on presence.
 */
export class ShopifyAppClient implements AppClient {
  private readonly clientSecret: string;

  constructor(config: AppConfig) {
    this.clientSecret = config.clientSecret;
  }

  getSellerTopics(): string[] {
    return getSubscribableShopifyTopics().map((spec) => spec.topic);
  }

  verifyNotification(
    input: VerifyNotificationInput
  ): Promise<NotificationEvent | null> {
    // Genuinely synchronous — no key fetch, unlike eBay. The contract is async
    // for the adapters that need it, so resolve rather than fake an await.
    return Promise.resolve(verifyNotification(this.clientSecret, input));
  }
}
