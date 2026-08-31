import { channel, channelWebhookSubscription } from "@dashseller/db/schema";
import { and, eq } from "drizzle-orm";
import type { SyncContext } from "../context";
import { recordDomainRun } from "../orders/watermark";

export type DisconnectOutcome =
  | { kind: "disconnected" }
  /** The payload's generation no longer matches — the seller reconnected
   * after this event fired; tearing the new connection down would be wrong. */
  | { kind: "stale-generation" }
  /** Remote verification proved the grant is alive — the event is stale
   * (delivered after a reconnect) even though its generation matched. */
  | { kind: "still-connected" }
  /** Verification threw while the payload's generation still matches the
   * live connection. The fence cannot arbitrate this case (a delayed event
   * matches by construction), so the caller must RETRY the job rather than
   * disconnect or drop. */
  | { kind: "verify-inconclusive" }
  | { kind: "not-found" };

/**
 * Disconnect a channel in response to an authorization-revoked event
 * (`app/uninstalled`, MARKETPLACE_ACCOUNT_DELETION, auth-permanent refresh).
 *
 * Generation-fenced: the delivery carries the `connectionGeneration` it was
 * resolved under; a reconnect rotates the generation in the same
 * transaction that persists new tokens, so a delayed or redelivered
 * uninstall from the PREVIOUS connection no-ops instead of disconnecting a
 * live reinstall and deleting the subscription rows the reconnect wrote.
 *
 * The fence alone cannot cover an event DELAYED until after the reconnect:
 * channel resolution stamps the CURRENT generation onto it at receipt, so
 * it matches. `verifyStillConnected` is therefore consulted FIRST when
 * provided — remote truth beats the fence in both directions: a live grant
 * vetoes the disconnect regardless of generation, and a dead grant
 * disconnects even on a stale one. An inconclusive verification (threw)
 * must NOT fall back to the fence on a matching generation — the match
 * proves nothing there — so it becomes `verify-inconclusive` and the
 * caller retries; on a mismatched generation the event provably predates
 * the current connection and is dropped as stale.
 */
export async function disconnectChannel(
  ctx: SyncContext,
  params: {
    channelId: string;
    expectedGeneration: string;
    reason: string;
    /** Return false when the marketplace says the grant is revoked; throw
     * when that could not be determined. */
    verifyStillConnected?: () => Promise<boolean>;
  }
): Promise<DisconnectOutcome> {
  const applyDisconnect = async (generation?: string) => {
    const [row] = await ctx.db
      .update(channel)
      .set({
        connected: false,
        updatedAt: new Date(),
      })
      .where(
        generation === undefined
          ? eq(channel.id, params.channelId)
          : and(
              eq(channel.id, params.channelId),
              eq(channel.connectionGeneration, generation)
            )
      )
      .returning({ organizationId: channel.organizationId });
    if (!row) {
      return false;
    }
    // The disconnect reason lives on the channels-domain sync state — it's
    // what the UI surfaces as "reconnect required".
    await recordDomainRun(ctx, {
      channelId: params.channelId,
      domain: "channels",
      error: params.reason,
      organizationId: row.organizationId,
      ranAt: ctx.clock.now(),
      success: false,
    });
    return true;
  };

  if (params.verifyStillConnected) {
    // Pin the generation the verification will speak for: the marketplace
    // answers about the grant that exists NOW, so the revoked-path
    // disconnect below must CAS on this snapshot. A reconnect racing the
    // verification rotates the generation, and the CAS must lose rather
    // than tear down the connection the reconnect just built.
    const [snapshot] = await ctx.db
      .select({ connectionGeneration: channel.connectionGeneration })
      .from(channel)
      .where(eq(channel.id, params.channelId))
      .limit(1);
    if (!snapshot) {
      return { kind: "not-found" };
    }

    const verdict = await params.verifyStillConnected().then(
      (alive) => (alive ? ("alive" as const) : ("revoked" as const)),
      // Verification itself failing proves nothing either way.
      () => "unknown" as const
    );
    if (verdict === "alive") {
      ctx.logger.info(
        "Disconnect skipped — marketplace grant verified still active",
        { channelId: params.channelId, reason: params.reason }
      );
      return { kind: "still-connected" };
    }
    if (verdict === "revoked") {
      if (await applyDisconnect(snapshot.connectionGeneration)) {
        await removeSubscriptionRows(ctx, params.channelId);
        ctx.logger.info("Channel disconnected", {
          channelId: params.channelId,
          reason: params.reason,
        });
        return { kind: "disconnected" };
      }
      // CAS lost: the channel vanished, or a reconnect rotated the
      // generation while verification was in flight — the dead verdict
      // described the OLD grant, so the fresh connection stays.
      const [existing] = await ctx.db
        .select({ id: channel.id })
        .from(channel)
        .where(eq(channel.id, params.channelId))
        .limit(1);
      if (!existing) {
        return { kind: "not-found" };
      }
      ctx.logger.info(
        "Stale disconnect ignored — channel reconnected during verification",
        { channelId: params.channelId }
      );
      return { kind: "stale-generation" };
    }
    // Unknown: decide by whether the fence can prove anything. A mismatch
    // proves the event predates the current connection — drop as stale. A
    // match proves NOTHING (delayed events match by construction), so the
    // only safe move is to leave the connection untouched and retry.
    const [row] = await ctx.db
      .select({ connectionGeneration: channel.connectionGeneration })
      .from(channel)
      .where(eq(channel.id, params.channelId))
      .limit(1);
    if (!row) {
      return { kind: "not-found" };
    }
    if (row.connectionGeneration !== params.expectedGeneration) {
      ctx.logger.info("Stale disconnect ignored — channel was reconnected", {
        channelId: params.channelId,
        expectedGeneration: params.expectedGeneration,
      });
      return { kind: "stale-generation" };
    }
    ctx.logger.warn(
      "Grant verification inconclusive — deferring disconnect for retry",
      { channelId: params.channelId, reason: params.reason }
    );
    return { kind: "verify-inconclusive" };
  }

  if (await applyDisconnect(params.expectedGeneration)) {
    await removeSubscriptionRows(ctx, params.channelId);
    ctx.logger.info("Channel disconnected", {
      channelId: params.channelId,
      reason: params.reason,
    });
    return { kind: "disconnected" };
  }

  const [existing] = await ctx.db
    .select({ id: channel.id })
    .from(channel)
    .where(eq(channel.id, params.channelId))
    .limit(1);
  if (!existing) {
    return { kind: "not-found" };
  }

  ctx.logger.info("Stale disconnect ignored — channel was reconnected", {
    channelId: params.channelId,
    expectedGeneration: params.expectedGeneration,
  });
  return { kind: "stale-generation" };
}

/**
 * Local subscription rows belong to the dead connection — remove them so a
 * reconnect starts from a clean slate. Remote-side cancellation (which
 * needs the seller token, possibly already dead) is the caller's concern.
 */
async function removeSubscriptionRows(
  ctx: SyncContext,
  channelId: string
): Promise<void> {
  await ctx.db
    .delete(channelWebhookSubscription)
    .where(eq(channelWebhookSubscription.channelId, channelId));
}
