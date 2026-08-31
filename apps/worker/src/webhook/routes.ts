import { Hono } from "hono";
import { getWebhookPolicy } from "./policy";
import { createReceiveHandler, type WebhookReceiverDeps } from "./receive";

/**
 * Inbound marketplace webhooks, keyed by the `:marketplace` path param.
 * Public, unauthenticated routes — authenticity is proven per-delivery by
 * signature verification inside the receiver.
 */
export function createWebhookRoutes(
  deps: WebhookReceiverDeps & {
    /**
     * Public base URL of THIS worker. Challenge hashes are computed over
     * the exact URL the marketplace registered, so this must byte-match
     * the registered endpoint's origin.
     */
    webhookBaseUrl: string;
  }
): Hono {
  const webhookRoutes = new Hono();

  /**
   * Endpoint-validation challenge. 404 for marketplaces without one —
   * nothing is listening for a handshake that never comes.
   *
   * eBay fires this when the endpoint is registered or re-pointed —
   * Notification API createDestination/updateDestination (which validate
   * synchronously). Ongoing health is judged by whether POSTed
   * notifications get ACKed, not by this route.
   */
  webhookRoutes.get("/:marketplace", (c) => {
    const answerChallenge = getWebhookPolicy(
      deps.policies,
      c.req.param("marketplace")
    )?.policy.answerChallenge;
    if (!answerChallenge) {
      return c.notFound();
    }
    const challengeCode = c.req.query("challenge_code");
    if (!challengeCode) {
      return c.text("Missing challenge_code", 400);
    }
    console.log(
      `${c.req.param("marketplace")} webhook: endpoint-validation challenge received`
    );
    return c.json(
      answerChallenge({
        challengeCode,
        // Derived from the path actually requested rather than a constant,
        // so every endpoint we register validates against the URL the
        // marketplace used. The hash only matches when the two agree byte
        // for byte.
        endpoint: new URL(c.req.path, deps.webhookBaseUrl).toString(),
      })
    );
  });

  webhookRoutes.post("/:marketplace", createReceiveHandler(deps));

  return webhookRoutes;
}
