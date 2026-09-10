/**
 * Box-owned mobile personas. Acquisition and reseeding serialize on app/label;
 * the partial unique index enforces one active owner, including during cooldown.
 * Dead rows retain box history. This does not serialize HTTP or place workers.
 *
 * Typical workflow usage:
 *
 *   const manager = await MobileProfileTokenManager.loadForThisBox("ebay");
 *   const client = await manager.createScanClient();
 *   try {
 *     const result = await client.searchListings({ keyword: "toy" });
 *     await manager.markUsed();
 *     return result;
 *   } catch (err) {
 *     if (err instanceof ScanRequestError && err.isAuthFailure()) {
 *       await manager.markDataAuthFailure(err.message);
 *     } else {
 *       await manager.markSoftFailure(
 *         err instanceof Error ? err.message : String(err)
 *       );
 *     }
 *     throw err;
 *   }
 *
 * Bearer cache:
 *   - `mobile_profile.access_token` holds an encrypted bearer with
 *     `access_token_expires_at` as expiry. The manager reuses cached bearers
 *     until they near expiry (5-minute buffer).
 *   - On 401/403 from a *data* endpoint (`markDataAuthFailure`), the bearer is
 *     evicted and the next call re-mints. The persona itself stays active
 *     unless re-minting also fails (then `markDead`).
 *   - On 401/403 from the *mint* endpoint, the device credentials are dead;
 *     the manager promotes the persona straight to `dead`.
 */
import { db } from "@dashseller/db";
import {
  acquireMobileProfile,
  lockMobileProfileOwner,
} from "@dashseller/db/mobile-profile-ownership";
import type {
  EbayHmacCredentials,
  MobileCredentials,
  SelectMobileProfile,
  ShopRefreshTokenCredentials,
} from "@dashseller/db/schema";
import { mobileProfile } from "@dashseller/db/schema";
import { env } from "@dashseller/env/trigger-scan";
import { createScanClient, getScanToken } from "@dashseller/marketplace-scan";
import { ScanRequestError } from "@dashseller/marketplace-scan/errors";
import type {
  ScanClient,
  ScanCredentials,
  ScanTokenResult,
} from "@dashseller/marketplace-scan/types";
import { logger } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import { getBoxName, parseWorkerLabel } from "./box-name";
import { PersonaUnavailableError } from "./scan-errors";
import { decryptSecret, encryptSecret } from "./secret-crypto";

/** Default consecutive soft failures before promoting a profile to `dead`. */
const DEFAULT_DEAD_THRESHOLD = 3;
/** Default cooldown window applied on each soft failure. */
const DEFAULT_COOLDOWN_MINUTES = 15;
/** Refresh the cached bearer this many milliseconds before it would expire. */
const BEARER_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export interface MarkSoftFailureOptions {
  /** Override the cooldown window (minutes from now). */
  cooldownMinutes?: number;
  /** Promote the profile to `dead` once this many consecutive soft failures have happened. */
  promoteToDeadAfter?: number;
}

export class MobileProfileTokenManager {
  private profile: SelectMobileProfile;
  private credentials: MobileCredentials | null = null;

  constructor(profile: SelectMobileProfile) {
    this.profile = profile;
  }

  get profileId(): string {
    return this.profile.id;
  }

  get app(): string {
    return this.profile.app;
  }

  /**
   * Return a usable bearer for this profile. Reads the cached bearer when
   * fresh; otherwise mints a new one via the app's mobile auth endpoint,
   * persists it (encrypted) on the profile row, and returns it.
   *
   * Mutating side effect on cache miss — but the persisted columns are
   * orthogonal to LRU bookkeeping, so this won't disrupt pool ordering.
   */
  async getValidAccessToken(): Promise<string> {
    const cached = await this.readCachedBearer();
    if (cached) {
      return cached;
    }
    return await this.deriveAndPersistBearer();
  }

  /**
   * Build a `ScanClient` wired to this profile's bearer. The provider is
   * called per-request, so a long-running scan with multiple adapter calls
   * will reuse the cached bearer and re-mint only when it actually expires.
   *
   * The decrypted credentials blob is also forwarded — adapters that need
   * per-request identity (shop's device fingerprint) read it directly,
   * adapters that don't (eBay today) ignore it. Resolving credentials
   * eagerly here matches what the shop client's constructor requires.
   *
   * Note: the persona's `app` happens to match a scan-marketplace id today
   * (every persona we have is for a marketplace mobile app). If we ever add
   * a persona for an app that isn't a marketplace, this method moves up to
   * the caller.
   */
  async createScanClient(): Promise<ScanClient> {
    const credentials = (await this.loadCredentials()) as ScanCredentials;
    return createScanClient(this.profile.app, {
      getAuthToken: () => this.getValidAccessToken(),
      credentials,
    });
  }

  /**
   * Successful call. Bumps `lastUsedAt` + `lastSuccessAt`, resets
   * `failureCount`, clears any active cooldown.
   */
  async markUsed(): Promise<void> {
    const now = new Date();
    await db
      .update(mobileProfile)
      .set({
        lastUsedAt: now,
        lastSuccessAt: now,
        failureCount: 0,
        cooldownUntil: null,
        failureReason: null,
      })
      .where(
        and(
          eq(mobileProfile.id, this.profile.id),
          eq(mobileProfile.status, "active")
        )
      );
  }

  /**
   * Transient failure (429, 5xx, network). Increments failure count, applies
   * cooldown, and promotes to `dead` if the count hits the threshold.
   */
  async markSoftFailure(
    reason: string,
    options: MarkSoftFailureOptions = {}
  ): Promise<void> {
    const promoteAfter = options.promoteToDeadAfter ?? DEFAULT_DEAD_THRESHOLD;
    const cooldownMs =
      (options.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES) * 60_000;
    const now = new Date();
    const changed = await db.transaction(async (tx) => {
      await lockMobileProfileOwner(tx, this.profile.app, this.profile.label);
      const [current] = await tx
        .select()
        .from(mobileProfile)
        .where(
          and(
            eq(mobileProfile.id, this.profile.id),
            eq(mobileProfile.status, "active")
          )
        )
        .limit(1)
        .for("update");
      if (!current) {
        return undefined;
      }
      const nextCount = current.failureCount + 1;
      const [row] = await tx
        .update(mobileProfile)
        .set({
          lastUsedAt: now,
          failureCount: nextCount,
          failureReason: reason.slice(0, 500),
          cooldownUntil: new Date(now.getTime() + cooldownMs),
          ...(nextCount >= promoteAfter
            ? { status: "dead" as const, failedAt: now }
            : {}),
        })
        .where(eq(mobileProfile.id, current.id))
        .returning();
      return row;
    });
    if (changed) {
      this.profile = changed;
    }
    if (changed?.status === "dead") {
      logger.warn("Mobile profile promoted to dead", {
        profileId: changed.id,
        app: changed.app,
        failureCount: changed.failureCount,
      });
    }
  }

  /**
   * 401/403 from a *data* endpoint. The cached bearer is evicted; the
   * persona stays active so the next call re-mints. Most natural-bearer-
   * expiry failures are absorbed here without operator intervention.
   *
   * If re-minting itself fails with 401/403, that path calls `markDead`
   * directly — the device credentials are toast.
   */
  async markDataAuthFailure(reason: string): Promise<void> {
    await db
      .update(mobileProfile)
      .set({
        accessToken: null,
        accessTokenExpiresAt: null,
        failureReason: reason.slice(0, 500),
      })
      .where(
        and(
          eq(mobileProfile.id, this.profile.id),
          eq(mobileProfile.status, "active")
        )
      );
  }

  /**
   * Hard failure of the persona itself (e.g. mint endpoint 401/403). The
   * device credentials no longer work; the persona is removed from the pool
   * until an operator seeds a new one.
   */
  async markDead(reason: string): Promise<void> {
    await db.transaction(async (tx) => {
      await lockMobileProfileOwner(tx, this.profile.app, this.profile.label);
      await tx
        .update(mobileProfile)
        .set({
          status: "dead",
          lastUsedAt: new Date(),
          failedAt: new Date(),
          failureReason: reason.slice(0, 500),
        })
        .where(
          and(
            eq(mobileProfile.id, this.profile.id),
            eq(mobileProfile.status, "active")
          )
        );
    });
    logger.warn("Mobile profile marked dead", {
      profileId: this.profile.id,
      app: this.profile.app,
    });
  }

  /** Resolve the box first, then atomically reuse or claim its active persona. */
  static async loadForThisBox(app: string): Promise<MobileProfileTokenManager> {
    const boxName = await getBoxName();
    if (!boxName) {
      throw new Error(
        `cannot resolve box identity (boxinfo sidecar unreachable); refusing to pick a ${app} persona`
      );
    }
    const label = parseWorkerLabel(boxName);
    if (!label) {
      throw new Error(
        `box hostname "${boxName}" has no worker-label prefix (expected "w-NNNNN-...")`
      );
    }
    const acquired = await acquireMobileProfile(db, app, label);
    if ("reason" in acquired) {
      throw new PersonaUnavailableError(acquired.reason, {
        app,
        label,
        ...("until" in acquired ? { until: acquired.until } : {}),
      });
    }
    if (acquired.claimed) {
      logger.info("Claimed mobile profile for box", {
        app,
        label,
        profileId: acquired.profile.id,
      });
    }
    return new MobileProfileTokenManager(acquired.profile);
  }

  // ============================================================================
  // Internal: bearer cache + mint
  // ============================================================================

  private async readCachedBearer(): Promise<string | null> {
    if (!(this.profile.accessToken && this.profile.accessTokenExpiresAt)) {
      return null;
    }
    const expiresAt = this.profile.accessTokenExpiresAt.getTime();
    if (expiresAt - Date.now() < BEARER_EXPIRY_BUFFER_MS) {
      return null;
    }
    return await decryptSecret(this.profile.accessToken, env.ENCRYPTION_SECRET);
  }

  /**
   * Decrypt the cached refresh token if present and not near expiry. Returns
   * null when no refresh token is cached, the upstream-supplied TTL is past,
   * or the app doesn't issue refresh tokens (eBay personas always
   * return null here).
   */
  private async readCachedRefreshToken(): Promise<string | null> {
    if (!this.profile.refreshToken) {
      return null;
    }
    if (this.profile.refreshTokenExpiresAt) {
      const expiresAt = this.profile.refreshTokenExpiresAt.getTime();
      if (expiresAt - Date.now() < BEARER_EXPIRY_BUFFER_MS) {
        return null;
      }
    }
    return await decryptSecret(
      this.profile.refreshToken,
      env.ENCRYPTION_SECRET
    );
  }

  /**
   * Derive a fresh bearer for this profile and persist it. Delegates
   * mint-vs-refresh dispatch to `getScanToken` (the factory in
   * `@dashseller/marketplace-scan`); the manager just supplies credentials
   * and any cached refresh token.
   *
   * Auth failure on derivation = the persona's stable secret is rejected →
   * `markDead`. Transient failures bubble through to the caller as-is.
   */
  private async deriveAndPersistBearer(): Promise<string> {
    const credentials = await this.loadCredentials();
    const refreshToken = await this.readCachedRefreshToken();

    let result: ScanTokenResult;
    try {
      result = await getScanToken(
        this.buildTokenInput(credentials, refreshToken)
      );
    } catch (error) {
      if (error instanceof ScanRequestError && error.isAuthFailure()) {
        await this.markDead(`derivation failed: ${error.message}`);
      }
      throw error;
    }

    await this.persistTokenResult(result);
    return result.accessToken;
  }

  /**
   * Build the discriminated `ScanTokenInput` for `getScanToken`. Branches on
   * `profile.app` (the column is the single source of truth — the credentials
   * blob carries no in-line tag). eBay's orchestrator ignores any refresh
   * token (none exists upstream); shop's uses it to prefer the refresh path
   * over the mint.
   */
  private buildTokenInput(
    credentials: MobileCredentials,
    refreshToken: string | null
  ): Parameters<typeof getScanToken>[0] {
    switch (this.profile.app) {
      case "ebay":
        return {
          marketplace: "ebay",
          credentials: credentials as EbayHmacCredentials,
        };
      case "shop":
        return {
          marketplace: "shop",
          credentials: credentials as ShopRefreshTokenCredentials,
          refreshToken,
        };
      default:
        throw new Error(`Unsupported mobile profile app: ${this.profile.app}`);
    }
  }

  /**
   * Encrypt and persist the access + (optional) refresh token from a
   * derive-bearer result, keeping in-memory profile state in sync.
   */
  private async persistTokenResult(result: ScanTokenResult): Promise<void> {
    const encryptedBearer = await encryptSecret(
      result.accessToken,
      env.ENCRYPTION_SECRET
    );
    const encryptedRefreshToken = result.refreshToken
      ? await encryptSecret(result.refreshToken, env.ENCRYPTION_SECRET)
      : null;
    const refreshTokenExpiresAt = result.refreshTokenExpiresAt ?? null;

    await db
      .update(mobileProfile)
      .set({
        accessToken: encryptedBearer,
        accessTokenExpiresAt: result.expiresAt,
        refreshToken: encryptedRefreshToken,
        refreshTokenExpiresAt,
      })
      .where(
        and(
          eq(mobileProfile.id, this.profile.id),
          eq(mobileProfile.status, "active")
        )
      );

    this.profile = {
      ...this.profile,
      accessToken: encryptedBearer,
      accessTokenExpiresAt: result.expiresAt,
      refreshToken: encryptedRefreshToken,
      refreshTokenExpiresAt,
    };
  }

  private async loadCredentials(): Promise<MobileCredentials> {
    if (this.credentials) {
      return this.credentials;
    }
    const decrypted = await decryptSecret(
      this.profile.credentials,
      env.ENCRYPTION_SECRET
    );
    const parsed = JSON.parse(decrypted) as MobileCredentials;
    this.credentials = parsed;
    return parsed;
  }
}
