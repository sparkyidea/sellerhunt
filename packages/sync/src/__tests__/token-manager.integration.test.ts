import { createDbClient } from "@dashseller/db/client";
import {
  channel,
  channelSyncState,
  channelToken,
  marketplace,
  organization,
} from "@dashseller/db/schema";
import { migrateTestDb, TEST_DATABASE_URL } from "@dashseller/db/testing";
import type { ApiClient, TokenResponse } from "@dashseller/marketplace/types";
import { decryptSecret } from "@dashseller/marketplace/utils/decrypt-secret";
import { encryptSecret } from "@dashseller/marketplace/utils/encrypt-secret";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SyncContext } from "../context";
import { systemClock } from "../context";
import { TokenAuthError, TokenManager } from "../token-manager";

const ENCRYPTION_SECRET = "test-encryption-secret-32-chars!!";

let client: ReturnType<typeof createDbClient>;
let ctx: SyncContext;

function createCtx(db: SyncContext["db"]): SyncContext {
  return {
    db,
    clock: systemClock,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    credentials: {
      encryptionSecret: ENCRYPTION_SECRET,
      getAppCredentials: () => {
        throw new Error("not used in this test");
      },
      getMarketplaceCredentials: () => ({
        clientId: "client-id",
        clientSecret: "client-secret",
      }),
    },
    geo: {
      getProviderId: () => "rollo" as const,
      geocode: () => {
        throw new Error("not used in this test");
      },
    },
  };
}

/**
 * ApiClient stub: only `refresh` is reachable from TokenManager. The
 * factory signature is preserved so the stub passes through the real
 * constructor path.
 */
function createStubFactory(
  refresh: () => Promise<TokenResponse>
): () => ApiClient {
  const unreachable = () => {
    throw new Error("not used in this test");
  };
  return () => ({
    createFulfillment: unreachable,
    getChannel: unreachable,
    getFulfillments: unreachable,
    getListings: unreachable,
    getOrders: unreachable,
    refresh,
  });
}

async function seedChannel(id: string): Promise<void> {
  const { db } = client;
  await db
    .insert(organization)
    .values({
      id: `org-${id}`,
      name: "Test Org",
      slug: `org-${id}`,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  await db
    .insert(marketplace)
    .values({ id: "ebay", name: "eBay" })
    .onConflictDoNothing();
  await db.insert(channel).values({
    id,
    organizationId: `org-${id}`,
    marketplaceId: "ebay",
    reference: `seller-${id}`,
    displayName: "Test Seller",
    connected: true,
  });
  await db.insert(channelToken).values({
    channelId: id,
    accessToken: await encryptSecret("stale-access", ENCRYPTION_SECRET),
    refreshToken: await encryptSecret("stale-refresh", ENCRYPTION_SECRET),
    // Expired: forces every manager into the refresh path.
    accessTokenExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
    refreshTokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });
}

async function createManager(channelId: string): Promise<{
  manager: (factory: () => ApiClient) => TokenManager;
}> {
  const loaded = await TokenManager.loadForChannel(ctx, channelId);
  return {
    manager: (factory) =>
      new TokenManager(ctx, loaded.channelDetails, loaded.tokenData, factory),
  };
}

beforeAll(async () => {
  await migrateTestDb();
  client = createDbClient(TEST_DATABASE_URL);
  ctx = createCtx(client.db);
});

afterAll(async () => {
  await client.close();
});

describe("TokenManager concurrent refresh", () => {
  it("serializes concurrent refreshes into one token-endpoint call", async () => {
    const channelId = `ch-refresh-${crypto.randomUUID()}`;
    await seedChannel(channelId);

    let refreshCalls = 0;
    const factory = createStubFactory(async () => {
      refreshCalls += 1;
      // Widen the race window so the loser is provably waiting on the lock.
      await new Promise((resolve) => setTimeout(resolve, 250));
      return {
        accessToken: "fresh-access",
        expiresIn: 7200,
        refreshToken: "fresh-refresh",
        refreshTokenExpiresIn: 47_304_000,
        tokenType: "Bearer",
      };
    });

    const a = await createManager(channelId);
    const b = await createManager(channelId);

    const [tokenA, tokenB] = await Promise.all([
      a.manager(factory).getValidAccessToken(),
      b.manager(factory).getValidAccessToken(),
    ]);

    expect(refreshCalls).toBe(1);
    expect(tokenA).toBe("fresh-access");
    expect(tokenB).toBe("fresh-access");

    const [row] = await client.db
      .select()
      .from(channelToken)
      .where(eq(channelToken.channelId, channelId));
    expect(row).toBeDefined();
    if (row) {
      await expect(
        decryptSecret(row.accessToken, ENCRYPTION_SECRET)
      ).resolves.toBe("fresh-access");
      await expect(
        decryptSecret(row.refreshToken, ENCRYPTION_SECRET)
      ).resolves.toBe("fresh-refresh");
    }
  });

  it("disconnects the channel when the grant is permanently rejected", async () => {
    const channelId = `ch-auth-${crypto.randomUUID()}`;
    await seedChannel(channelId);

    const factory = createStubFactory(() =>
      Promise.reject(
        Object.assign(new Error("invalid_grant"), { statusCode: 400 })
      )
    );

    const { manager } = await createManager(channelId);
    await expect(manager(factory).getValidAccessToken()).rejects.toBeInstanceOf(
      TokenAuthError
    );

    const [row] = await client.db
      .select()
      .from(channel)
      .where(eq(channel.id, channelId));
    expect(row?.connected).toBe(false);

    const [state] = await client.db
      .select()
      .from(channelSyncState)
      .where(eq(channelSyncState.channelId, channelId));
    expect(state?.domain).toBe("channels");
    expect(state?.status).toBe("error");
    expect(state?.error).toContain("reconnect");
  });

  it("does not disconnect on transient failures", async () => {
    const channelId = `ch-transient-${crypto.randomUUID()}`;
    await seedChannel(channelId);

    const factory = createStubFactory(() =>
      Promise.reject(
        Object.assign(new Error("upstream unavailable"), { statusCode: 503 })
      )
    );

    const { manager } = await createManager(channelId);
    await expect(manager(factory).getValidAccessToken()).rejects.toThrow(
      "upstream unavailable"
    );

    const [row] = await client.db
      .select()
      .from(channel)
      .where(eq(channel.id, channelId));
    expect(row?.connected).toBe(true);
  });
});
