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

import { claimFreeProfile } from "@dashseller/db/lib/mobile-profile-claim";
import { fencedProfileWhere } from "@dashseller/db/lib/mobile-profile-fence";
import { decryptSecret, encryptSecret } from "@dashseller/db/lib/secret-crypto";
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
import { getBoxName } from "./box-name";
import { db } from "./db";
import { PersonaScanError, StaleMobileProfileError } from "./scan-errors";

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

  get profileId(): number {
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
   * Every write to this row goes through here. The statement is fenced on
   * `revision` (`fencedProfileWhere`): if an admin replaced the credentials,
   * evicted the bearer, reset failures or changed the status since this run
   * loaded the row, the in-memory persona is stale and the update matches no
   * row — throw `StaleMobileProfileError` rather than overwrite the admin's
   * change (Trigger retries with a fresh load, see `scanCatchError`). On
   * success the change is mirrored into `this.profile` so later writes in the
   * same run build on current values.
   */
  private async writeFenced(
    set: Partial<Omit<SelectMobileProfile, "id" | "revision">>
  ): Promise<void> {
    const updated = await db
      .update(mobileProfile)
      .set(set)
      .where(fencedProfileWhere(this.profile.id, this.profile.revision))
      .returning({ id: mobileProfile.id });
    if (updated.length === 0) {
      throw new StaleMobileProfileError(this.profile.id, this.profile.app);
    }
    this.profile = { ...this.profile, ...set };
  }

  /**
   * Successful call. Bumps `lastUsedAt` + `lastSuccessAt`, resets
   * `failureCount`, clears any active cooldown.
   */
  async markUsed(): Promise<void> {
    const now = new Date();
    await this.writeFenced({
      lastUsedAt: now,
      lastSuccessAt: now,
      failureCount: 0,
      cooldownUntil: null,
      failureReason: null,
    });
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

    await this.writeFenced({
      lastUsedAt: now,
      failureCount: nextCount,
      failureReason: reason.slice(0, 500),
      cooldownUntil: new Date(now.getTime() + cooldownMs),
      ...(shouldPromote ? { status: "dead" as const, failedAt: now } : {}),
    });

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
    await this.writeFenced({
      accessToken: null,
      accessTokenExpiresAt: null,
      failureReason: reason.slice(0, 500),
    });
  }

  /**
   * Hard failure of the persona itself (e.g. mint endpoint 401/403). The
   * device credentials no longer work; the persona is removed from the pool
   * until an operator seeds a new one.
   */
  async markDead(reason: string): Promise<void> {
    const now = new Date();
    await this.writeFenced({
      status: "dead",
      lastUsedAt: now,
      failedAt: now,
      failureReason: reason.slice(0, 500),
    });

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
   * `assignedWorker` equals `hostname` for the given app — the persona this
   * specific worker box owns. Returns `null` when the row is missing, `dead`,
   * or in cooldown; `loadForThisBox` tells those apart before failing.
   *
   * Unlike `loadNextActive`, there is no rotation: one box ↔ one persona. The
   * pinning keeps each captured device's traffic on a single machine/IP, which
   * is what the anti-detection model depends on. The pool failure semantics
   * (`markSoftFailure` cooldown, `markDead`) still apply — in pinned mode they
   * mean "this box backs off / is down" rather than "rotate to the next row".
   */
  static async loadForWorker(
    app: string,
    hostname: string
  ): Promise<MobileProfileTokenManager | null> {
    const now = new Date();
    const [row] = await db
      .select()
      .from(mobileProfile)
      .where(
        and(
          eq(mobileProfile.app, app),
          eq(mobileProfile.assignedWorker, hostname),
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
   * from the `boxinfo` sidecar, load the persona assigned to exactly that
   * hostname (`mobile_profile.assigned_worker`), and if the box owns none,
   * claim the lowest-numbered free one (`claimFreeProfile`) — that claim is
   * the assignment from then on. Throws (rather than returning null) so
   * callers stay one-liners — every failure here is fatal to the run and
   * surfaces a precise reason:
   *
   *   - sidecar unreachable → can't identify the box; we refuse to guess a
   *     persona (an LRU fallback would break box↔device pinning).
   *   - the box's row is in cooldown (a box never takes a second row) →
   *     `PersonaScanError`, so `scanCatchError` retries after the persona
   *     delay instead of burning the run's attempts within seconds.
   *   - the box's row is dead, or it has none and the pool has nothing free →
   *     plain error; an operator has to revive, upload or reassign, and the
   *     next cron tick re-fires.
   */
  static async loadForThisBox(app: string): Promise<MobileProfileTokenManager> {
    const boxName = await getBoxName();
    if (!boxName) {
      throw new Error(
        `cannot resolve box identity (boxinfo sidecar unreachable); refusing to pick a ${app} persona`
      );
    }
    const assigned = await MobileProfileTokenManager.loadForWorker(
      app,
      boxName
    );
    if (assigned) {
      return assigned;
    }

    const claimed = await claimFreeProfile(db, app, boxName);
    if (claimed) {
      logger.info("mobile profile claimed", {
        app,
        box: boxName,
        profileId: claimed.id,
      });
      return new MobileProfileTokenManager(claimed);
    }

    // `null` also covers a concurrent run of this same box that claimed first:
    // its row is ours now, so look once more before giving up.
    const raced = await MobileProfileTokenManager.loadForWorker(app, boxName);
    if (raced) {
      return raced;
    }
    throw await MobileProfileTokenManager.unusableProfileError(app, boxName);
  }

  /**
   * Why `loadForWorker` found nothing usable, as the error the run should
   * throw. A row in cooldown is temporary: the run gets `PersonaScanError` and
   * the 20-minute persona retry. A dead row or an empty pool needs an operator
   * and fails plainly.
   */
  private static async unusableProfileError(
    app: string,
    hostname: string
  ): Promise<Error> {
    const [owned] = await db
      .select({
        id: mobileProfile.id,
        status: mobileProfile.status,
        cooldownUntil: mobileProfile.cooldownUntil,
      })
      .from(mobileProfile)
      .where(
        and(
          eq(mobileProfile.app, app),
          eq(mobileProfile.assignedWorker, hostname)
        )
      )
      .limit(1);
    if (!owned) {
      return new Error(
        `no usable ${app} mobile profile for box "${hostname}": it has none and no unassigned active profile is free to claim`
      );
    }
    if (owned.status === "active") {
      // Active but not loadable: in cooldown (or it cleared between the two
      // reads, which the retry will simply find usable).
      const until = owned.cooldownUntil?.toISOString() ?? "now";
      return new PersonaScanError(
        `${app} mobile profile ${owned.id} for box "${hostname}" is in cooldown until ${until}; retrying after the persona delay`,
        false
      );
    }
    return new Error(
      `no usable ${app} mobile profile for box "${hostname}": its assigned profile ${owned.id} is dead`
    );
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
   * derive-bearer result (fenced; `writeFenced` keeps in-memory state in sync).
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

    await this.writeFenced({
      accessToken: encryptedBearer,
      accessTokenExpiresAt: result.expiresAt,
      refreshToken: encryptedRefreshToken,
      refreshTokenExpiresAt,
    });
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
