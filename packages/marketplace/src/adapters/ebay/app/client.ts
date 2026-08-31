import { createHash } from "node:crypto";
import type eBayApi from "ebay-api";
import type {
  AnswerChallengeInput,
  AppConfig,
  NotificationEvent,
  ReconcileDestinationOptions,
  VerifyNotificationInput,
} from "../../../types";
import type { AppClient } from "../../base";
import { createEbayAppClient } from "../create-ebay-client";
import { getSubscribableEbayTopics } from "../notification/topics";
import { reconcileDestination } from "./reconcile-destination";
import { verifyNotification } from "./verify-notification";

/**
 * When a destination is registered (Notification API createDestination, or the
 * developer-portal account-deletion form), eBay sends
 * `GET <endpoint>?challenge_code=...` and expects
 * `{"challengeResponse": sha256hex(challengeCode + verificationToken + endpoint)}`.
 *
 * The `endpoint` MUST be the exact URL eBay was given — any mismatch (trailing
 * slash, http vs https) produces a different hash and the registration fails.
 */
function computeChallengeResponse(input: AnswerChallengeInput): string {
  const hash = createHash("sha256");
  hash.update(input.challengeCode);
  hash.update(input.verificationToken);
  hash.update(input.endpoint);
  return hash.digest("hex");
}

/**
 * eBay application-token adapter for app-scoped operations.
 *
 * Authenticates as our application rather than a seller: the SDK mints and
 * caches a client-credentials token from the App ID / Cert ID pair, so there
 * are no user tokens to refresh and nothing per-channel to hold.
 */
export class EbayAppClient implements AppClient {
  private readonly client: eBayApi;

  constructor(config: AppConfig) {
    this.client = createEbayAppClient(config.clientId, config.clientSecret);
  }

  answerChallenge(input: AnswerChallengeInput): Record<string, string> {
    return { challengeResponse: computeChallengeResponse(input) };
  }

  getSellerTopics(): string[] {
    return getSubscribableEbayTopics().map((spec) => spec.topicId);
  }

  async reconcileDestination(
    options: ReconcileDestinationOptions
  ): Promise<string> {
    return await reconcileDestination(this.client, options);
  }

  async verifyNotification(
    input: VerifyNotificationInput
  ): Promise<NotificationEvent | null> {
    return await verifyNotification(this.client, input);
  }
}
