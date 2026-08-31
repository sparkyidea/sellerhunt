import { authServer } from "@dashseller/auth/auth-server";
import { db } from "@dashseller/db";
import {
  channel,
  channelSyncState,
  channelToken,
  marketplace,
} from "@dashseller/db/schema";
import { env } from "@dashseller/env/server";
import type {
  Channel,
  MarketplaceType,
  TokenResponse,
} from "@dashseller/marketplace/types";
import {
  calculateExpirationDate,
  SENTINEL_NEVER_EXPIRES_AT,
  SENTINEL_NO_REFRESH_TOKEN,
} from "@dashseller/marketplace/utils";
import { encryptSecret } from "@dashseller/marketplace/utils/encrypt-secret";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { reconcileChannelWebhookSubscriptions } from "../../../lib/channel-webhook";
import { jobs } from "../../../lib/jobs";

export const isDev = process.env.NODE_ENV === "development";

/**
 * Return the specific error code in development; collapse to a generic
 * `oauth_failed` in production so we don't leak internal details.
 */
export function getErrorCode(devCode: string): string {
  return isDev ? devCode : "oauth_failed";
}

/**
 * Build the user-facing redirect to the channels settings page with query
 * params indicating success or error.
 */
export function redirectChannels(
  c: Context,
  params: Record<string, string>
): Response {
  const qs = new URLSearchParams(params).toString();
  return c.redirect(`${env.APP_URL}/settings/channels?${qs}`);
}

/**
 * Persist a short-lived HTTP-only cookie used to round-trip OAuth state
 * between `/authorize` and `/callback`. 5-minute lifetime; secure in prod.
 */
export function setStateCookie(c: Context, name: string, value: string): void {
  setCookie(c, name, value, {
    httpOnly: true,
    secure: !isDev,
    sameSite: "Lax",
    maxAge: 300,
    path: "/",
  });
}

/**
 * Resolve the authenticated user session from request headers, or null when
 * the user isn't signed in.
 */
export async function requireSession(c: Context) {
  return await authServer.api.getSession({ headers: c.req.raw.headers });
}

export interface PersistOAuthChannelArgs {
  channelInfo: Channel;
  marketplaceId: string;
  session: {
    user: { id: string };
    session: { activeOrganizationId?: string | null };
  };
  tokenResponse: TokenResponse;
}

export type PersistOAuthChannelResult =
  | { ok: true; channelId: string }
  | { ok: false; errorCode: string };

/**
 * Encrypt OAuth tokens (substituting sentinels for marketplaces without a
 * refresh token), upsert the `channel` row, and upsert the `channel_token`
 * row keyed on (marketplaceId, reference).
 *
 * Returns the persisted channel ID on success, or an error code suitable for
 * passing into `redirectChannels`.
 */
export async function persistOAuthChannel(
  args: PersistOAuthChannelArgs
): Promise<PersistOAuthChannelResult> {
  const { session, marketplaceId, channelInfo, tokenResponse } = args;

  // Channels belong to the active organization (the tenant), not the user.
  // Mirror `orgProcedure`: prefer the session's active org, but fall back to
  // the user's first membership so a session without an active org set (e.g.
  // reached OAuth without calling `setActive`) can still connect a channel.
  let organizationId = session.session.activeOrganizationId ?? null;
  if (!organizationId) {
    const membership = await db.query.member.findFirst({
      where: (m, { eq }) => eq(m.userId, session.user.id),
      columns: { organizationId: true },
    });
    organizationId = membership?.organizationId ?? null;
  }
  if (!organizationId) {
    return { ok: false, errorCode: "no_active_organization" };
  }

  // Token expiry — when the marketplace doesn't issue an expiry (e.g. Shopify
  // offline access tokens never expire) the column gets the sentinel "never
  // expires" date so the NOT NULL constraint stays satisfied.
  const accessTokenExpiresAt =
    tokenResponse.expiresIn == null
      ? SENTINEL_NEVER_EXPIRES_AT
      : calculateExpirationDate(tokenResponse.expiresIn);
  const refreshTokenExpiresAt =
    tokenResponse.refreshTokenExpiresIn == null
      ? SENTINEL_NEVER_EXPIRES_AT
      : calculateExpirationDate(tokenResponse.refreshTokenExpiresIn);

  const encryptedAccessToken = await encryptSecret(
    tokenResponse.accessToken,
    env.ENCRYPTION_SECRET
  );
  const encryptedRefreshToken = await encryptSecret(
    tokenResponse.refreshToken ?? SENTINEL_NO_REFRESH_TOKEN,
    env.ENCRYPTION_SECRET
  );

  const marketplaceRecords = await db
    .select()
    .from(marketplace)
    .where(eq(marketplace.id, marketplaceId));

  if (marketplaceRecords.length === 0) {
    console.error(`${marketplaceId} marketplace not found in database`);
    return { ok: false, errorCode: "marketplace_not_found" };
  }

  // One transaction for the channel claim AND the token persistence: the
  // connection generation rotates with the tokens or not at all. A
  // delayed/redelivered uninstall from the PREVIOUS connection carries the
  // old generation and is fenced out by the disconnect worker — but only
  // if rotation can never be observed without the new tokens (and vice
  // versa).
  //
  // The conditional `setWhere` means a conflicting row owned by ANOTHER
  // organization is left untouched (no update, empty RETURNING), so we
  // never overwrite another tenant's channel: a same-org row is updated
  // (reconnect), a brand new store is inserted, and a store owned
  // elsewhere is rejected below.
  const now = new Date();
  const upserted = await db.transaction(async (tx) => {
    const [channelRow] = await tx
      .insert(channel)
      .values({
        organizationId,
        createdByUserId: session.user.id,
        marketplaceId,
        displayName: channelInfo.displayName,
        reference: channelInfo.reference,
        connected: true,
        connectedAt: now,
        connectionGeneration: crypto.randomUUID(),
        enabled: true,
        archived: false,
      })
      .onConflictDoUpdate({
        target: [channel.marketplaceId, channel.reference],
        set: {
          displayName: channelInfo.displayName,
          connected: true,
          connectedAt: now,
          connectionGeneration: crypto.randomUUID(),
          enabled: true,
          archived: false,
          updatedAt: now,
        },
        setWhere: eq(channel.organizationId, organizationId),
      })
      .returning();

    if (!channelRow) {
      return null;
    }

    // Disconnects record their reason on the channels-domain sync-state row
    // (nothing else writes that domain), so a successful reconnect must
    // clear it or the channels table keeps showing the dead connection's
    // error. Other domains keep their rows — their watermarks must survive
    // a reconnect so it doesn't force a full re-pull.
    await tx
      .delete(channelSyncState)
      .where(
        and(
          eq(channelSyncState.channelId, channelRow.id),
          eq(channelSyncState.domain, "channels")
        )
      );

    await tx
      .insert(channelToken)
      .values({
        channelId: channelRow.id,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
      })
      .onConflictDoUpdate({
        target: channelToken.channelId,
        set: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          accessTokenExpiresAt,
          refreshTokenExpiresAt,
          updatedAt: now,
        },
      });

    return channelRow;
  });

  if (!upserted) {
    // Empty RETURNING after a conflict means the store is already owned by a
    // different organization (the `setWhere` excluded its row). Confirm and
    // surface a clear error WITHOUT touching the other org's token.
    const owner = await db
      .select({ organizationId: channel.organizationId })
      .from(channel)
      .where(
        and(
          eq(channel.marketplaceId, marketplaceId),
          eq(channel.reference, channelInfo.reference)
        )
      )
      .limit(1);

    if (owner[0] && owner[0].organizationId !== organizationId) {
      return { ok: false, errorCode: "channel_already_linked" };
    }

    console.error(`Failed to create/update ${marketplaceId} channel record`);
    return { ok: false, errorCode: "channel_creation_failed" };
  }

  return { ok: true, channelId: upserted.id };
}

/**
 * Post-persist connect work, all best-effort — a connect NEVER fails past
 * this point:
 * 1. reconcile notification subscriptions with the fresh tokens (outcomes
 *    persisted inside the wrapper; the repair dispatcher re-runs failures)
 * 2. fan out the initial sync — LISTINGS ONLY. The listings processor
 *    chains the first orders pull on success, and the dispatcher's orders
 *    enqueue no-ops via the listings gate until then. A failed enqueue
 *    (Redis down) is covered by the next dispatcher tick, whose
 *    eligibility query picks the channel up anyway.
 */
export async function completeChannelConnection(args: {
  channelId: string;
  marketplaceId: MarketplaceType;
  shopUrl?: string;
  tokenResponse: TokenResponse;
}): Promise<void> {
  await reconcileChannelWebhookSubscriptions({
    accessToken: args.tokenResponse.accessToken,
    channelId: args.channelId,
    marketplaceId: args.marketplaceId,
    refreshToken: args.tokenResponse.refreshToken,
    shopUrl: args.shopUrl,
  });

  try {
    await jobs.enqueueSyncChannelListings({
      channelId: args.channelId,
      forceRefresh: false,
    });
  } catch (error) {
    console.warn(
      `${args.marketplaceId} initial sync enqueue failed (dispatcher will cover):`,
      error instanceof Error ? error.message : error
    );
  }
}
