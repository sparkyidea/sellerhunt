/**
 * Pool manager for `mobile_profile` rows. Replaces the previous
 * `MonitorTokenManager`: same LRU pool semantics, but the row stores **device
 * credentials** (long-lived, encrypted) instead of bearers, and the manager
 * mints bearers on demand by calling the app's mobile auth endpoint.
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
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getBoxName, parseWorkerLabel } from "./box-name";
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
      .where(eq(mobileProfile.id, this.profile.id));
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
    const nextCount = this.profile.failureCount + 1;
    const shouldPromote = nextCount >= promoteAfter;

    await db
      .update(mobileProfile)
      .set({
        lastUsedAt: now,
        failureCount: nextCount,
        failureReason: reason.slice(0, 500),
        cooldownUntil: new Date(now.getTime() + cooldownMs),
        ...(shouldPromote ? { status: "dead" as const, failedAt: now } : {}),
      })
      .where(eq(mobileProfile.id, this.profile.id));

    if (shouldPromote) {
      logger.warn("Mobile profile promoted to dead after repeated failures", {
        profileId: this.profile.id,
        app: this.profile.app,
        failureCount: nextCount,
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
      .where(eq(mobileProfile.id, this.profile.id));
  }

  /**
   * Hard failure of the persona itself (e.g. mint endpoint 401/403). The
   * device credentials no longer work; the persona is removed from the pool
   * until an operator seeds a new one.
   */
  async markDead(reason: string): Promise<void> {
    const now = new Date();
    await db
      .update(mobileProfile)
      .set({
        status: "dead",
        lastUsedAt: now,
        failedAt: now,
        failureReason: reason.slice(0, 500),
      })
      .where(eq(mobileProfile.id, this.profile.id));

    logger.warn("Mobile profile marked dead", {
      profileId: this.profile.id,
      app: this.profile.app,
      reason: reason.slice(0, 200),
    });
  }

  /**
   * Pool selector. Returns the least-recently-used active profile for the
   * given app, skipping any in cooldown. Returns `null` when the pool is
   * empty.
   *
   * No `FOR UPDATE SKIP LOCKED` reservation — two concurrent triggers may
   * pick the same profile, which is acceptable for read-only research. Add
   * row locking if concurrent contention starts triggering rate limits.
   */
  static async loadNextActive(
    app: string
  ): Promise<MobileProfileTokenManager | null> {
    const now = new Date();
    const [row] = await db
      .select()
      .from(mobileProfile)
      .where(
        and(
          eq(mobileProfile.app, app),
          eq(mobileProfile.status, "active"),
          or(
            isNull(mobileProfile.cooldownUntil),
            lt(mobileProfile.cooldownUntil, now)
          )
        )
      )
      .orderBy(
        sql`${mobileProfile.lastUsedAt} ASC NULLS FIRST`,
        asc(mobileProfile.id)
      )
      .limit(1);

    if (!row) {
      return null;
    }
    return new MobileProfileTokenManager(row);
  }

  /**
   * Box-pinned selector. Returns the active, non-cooling-down profile whose
   * `label` matches `label` for the given app — the persona this specific
   * worker box owns (label == box hostname). Returns `null` when the row is
   * missing, `dead`, or in cooldown; the caller turns that into a retryable
   * task error and the next cron tick re-fires once cooldown clears.
   *
   * Unlike `loadNextActive`, there is no rotation: one box ↔ one persona. The
   * pinning keeps each captured device's traffic on a single machine/IP, which
   * is what the anti-detection model depends on. The pool failure semantics
   * (`markSoftFailure` cooldown, `markDead`) still apply — in pinned mode they
   * mean "this box backs off / is down" rather than "rotate to the next row".
   */
  static async loadForLabel(
    app: string,
    label: string
  ): Promise<MobileProfileTokenManager | null> {
    const now = new Date();
    const [row] = await db
      .select()
      .from(mobileProfile)
      .where(
        and(
          eq(mobileProfile.app, app),
          eq(mobileProfile.label, label),
          eq(mobileProfile.status, "active"),
          or(
            isNull(mobileProfile.cooldownUntil),
            lt(mobileProfile.cooldownUntil, now)
          )
        )
      )
      .limit(1);

    if (!row) {
      return null;
    }
    return new MobileProfileTokenManager(row);
  }

  /**
   * Resolve the persona for the box this run executes on: read the box hostname
   * from the `boxinfo` sidecar, extract its `w-NNNNN` worker-label prefix, then
   * load the matching `(app, label)` persona. Throws (rather than returning
   * null) so callers stay one-liners — every failure here is fatal to the run
   * and surfaces a precise reason:
   *
   *   - sidecar unreachable → can't identify the box; we refuse to guess a
   *     persona (an LRU fallback would break box↔device pinning).
   *   - hostname has no worker prefix → this box isn't a scan-fleet worker.
   *   - no eligible persona → the worker has no active persona for `app`
   *     (unseeded, dead, or in cooldown). Trigger retries; the next cron tick
   *     re-fires once cooldown clears.
   */
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
    const manager = await MobileProfileTokenManager.loadForLabel(app, label);
    if (!manager) {
      throw new Error(
        `no active ${app} mobile profile for worker "${label}" (box "${boxName}": missing, dead, or in cooldown)`
      );
    }
    return manager;
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
      .where(eq(mobileProfile.id, this.profile.id));

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
