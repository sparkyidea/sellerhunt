/**
 * Mobile-app device persona used to derive short-lived bearer tokens for a
 * mobile app's unofficial API. Originally introduced for the
 * marketplace-scan scanner (eBay), but the persona itself is generic — any
 * future feature that needs to act as the iOS app for a given mobile app
 * shares this pool.
 *
 * Three layers on the row:
 *
 *   1. Pool lifecycle (universal): status, lastUsedAt, cooldownUntil,
 *      failureCount, etc. Mirrors `TokenManager`'s OAuth pool semantics.
 *   2. Bearer cache (universal): accessToken + accessTokenExpiresAt. The
 *      manager derives on first use, persists, and reuses until expiry.
 *      Plus refreshToken + refreshTokenExpiresAt when the app's mint flow
 *      issues a refresh token (shop.app today; eBay does not).
 *   3. Credentials blob (app-specific): an encrypted JWE of a JSON
 *      object holding the per-persona auth material. Shape varies per
 *      app — typed via `MobileCredentials` in application code,
 *      opaque text at the DB layer. Adding a new app doesn't
 *      require a migration.
 *
 * What's actually in the credentials blob depends on the app's auth scheme.
 * See `MobileCredentials` for the typed shape and per-variant JSDoc for what
 * each field is (secret vs identifier). Two examples today:
 *
 *   - eBay uses HMAC auth — credentials holds the stable signing key
 *     (`hmacKey`) plus device identifiers. Every mint signs a fresh
 *     timestamp with the HMAC key.
 *   - shop.app uses refresh-token auth — credentials holds only device
 *     identity headers (no secret). The actual server-recognized secret
 *     is the refresh token issued by the first `SignInAsGuest` call,
 *     which lives in `refreshToken`, not in `credentials`.
 *
 * Pool semantics:
 *   - Selector: WHERE app = $1 AND status = 'active'
 *               AND (cooldown_until IS NULL OR cooldown_until < now())
 *               ORDER BY last_used_at NULLS FIRST LIMIT 1
 *   - On success: bump `last_used_at`/`last_success_at`, reset `failure_count`,
 *     clear `cooldown_until`.
 *   - On soft failure (429/5xx): increment `failure_count`, set
 *     `cooldown_until = now() + interval '15 minutes'`. Promote to `dead`
 *     after N consecutive soft failures (policy lives in code).
 *   - On hard failure (401/403 from the auth-mint endpoint): set
 *     `status = 'dead'`, capture `failed_at` and `failure_reason`. The
 *     persona's stable auth material is toast — operator must seed a new
 *     persona.
 *
 * Encryption: `credentials`, `accessToken`, and `refreshToken` are all
 * encrypted JWE strings produced by `encryptSecret()` from
 * `packages/trigger-scan/src/utils/secret-crypto`. Decrypt at read time
 * with `decryptSecret()`. The encryption key is `env.ENCRYPTION_SECRET`.
 */
import type { InferSelectModel } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Lifecycle states for a `mobile_profile`.
 *
 * - `active` — usable; eligible for selection (combined with
 *   `cooldown_until < now()` for transient-failure backoff).
 * - `dead`   — permanently rejected. Skipped by the pool selector until an
 *   operator revives it.
 *
 * Transient backoff is represented by `cooldown_until > now()` on an `active`
 * row, not as a separate enum value — keeps the selector predicate simple.
 */
export const mobileProfileStatusEnum = pgEnum("mobile_profile_status", [
  "active",
  "dead",
]);

export const mobileProfile = pgTable(
  "mobile_profile",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /**
     * Which mobile app this persona impersonates (e.g. "ebay", "shop"). Used
     * as the pool-selector discriminator and as the runtime tag the manager
     * narrows `MobileCredentials` on at read time. The set of values is open
     * — adding a new mobile app doesn't require a migration.
     */
    app: text("app").notNull(),
    /** Human-readable label for ops UIs and logs (e.g. "iPhone-1", "burner-3"). */
    label: text("label"),

    /**
     * Encrypted JWE ciphertext (text, NOT jsonb). After `decryptSecret()` →
     * `JSON.parse()`, the in-memory shape is `MobileCredentials`
     * (discriminated by `app`). Stored as text because the on-disk value is
     * encrypted — `jsonb` would require parseable JSON, which ciphertext is
     * not. Required at insert time; the manager decrypts → parses → uses to
     * derive bearers.
     */
    credentials: text("credentials").notNull(),

    /**
     * Cached access bearer for the mobile API. Encrypted text — same
     * `encrypted text NOT jsonb` constraint as `credentials`. Null means
     * "no cache yet — derive via the available stable secret". Refreshed
     * when `accessTokenExpiresAt` is past (or near, with a small buffer).
     */
    accessToken: text("access_token"),
    /** Expiry of the cached bearer. Paired with `accessToken`. */
    accessTokenExpiresAt: timestamp("access_token_expires_at"),

    /**
     * Cached upstream-issued refresh token. Encrypted text — same
     * `encrypted text NOT jsonb` constraint as `credentials`. Distinct from
     * `credentials`:
     *   - `credentials` is the ops-managed stable secret (HMAC key for eBay)
     *     or device-identity headers (shop) — the app never mutates it.
     *   - `refreshToken` is server-issued and rotates per mint cycle; the
     *     app reads + writes it as the upstream rotates it.
     *
     * Null for apps whose mint flow doesn't issue a refresh token (eBay's
     * `device_credentials` grant returns access-only). Populated for apps
     * that do (shop.app's `SignInAsGuest`). The manager prefers the
     * refresh-token path on expiry because it imitates a real mobile-app
     * session (real users don't re-run SignInAsGuest every day) and avoids
     * the more expensive mint endpoint.
     */
    refreshToken: text("refresh_token"),
    /**
     * Expiry of the cached refresh token, when the upstream surfaces one.
     * Null when the upstream doesn't say — treat as "try until rejected".
     */
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),

    status: mobileProfileStatusEnum("status").notNull().default("active"),
    /** Last time any adapter call used this profile, regardless of outcome. */
    lastUsedAt: timestamp("last_used_at"),
    /** Last 2xx response. Reset is a write event; absence ≠ never used. */
    lastSuccessAt: timestamp("last_success_at"),
    /** Set when the profile transitioned to `dead`. */
    failedAt: timestamp("failed_at"),
    /** Free-form note for ops (e.g. "401 Invalid access token"). */
    failureReason: text("failure_reason"),
    /** Consecutive failure count; reset to 0 on next success. */
    failureCount: integer("failure_count").notNull().default(0),
    /**
     * If set in the future, the profile is in transient backoff — the pool
     * selector skips it until the timestamp passes. Cleared on next success.
     */
    cooldownUntil: timestamp("cooldown_until"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    // Pool selection: filter by app + status, then order by LRU.
    index("mobile_profile_app_status_idx").on(t.app, t.status),
    index("mobile_profile_last_used_at_idx").on(t.lastUsedAt),
    // Ops queries: find profiles in cooldown / dead.
    index("mobile_profile_cooldown_until_idx").on(t.cooldownUntil),
  ]
);

export type SelectMobileProfile = InferSelectModel<typeof mobileProfile>;

/**
 * Decrypted shape of `mobile_profile.credentials` for an eBay iOS persona.
 *
 * **Auth scheme: HMAC.** `hmacKey` is the stable secret — every mint signs
 * a fresh timestamp with it via HMAC-SHA512, and the signature is what eBay
 * validates as proof. The device identifiers below are sent alongside the
 * signature but are not themselves secrets.
 *
 * Captured once per device via Frida instrumentation of the iOS app's CCHmac
 * call (`hmacKey`) and a runtime curl capture (everything else).
 */
export interface EbayHmacCredentials {
  /**
   * Identifier — eBay app client ID (e.g. "eBayInc80-..."). Used in body and
   * as the `Authorization: APP <clientId>` header on the auth-mint request.
   */
  clientId: string;
  /**
   * Identifier — device attestation token. Appears as both an identifier in
   * the signed deviceSignature payload and as the `X-EBAY-4PP` header.
   */
  device4pp: string;
  /**
   * Identifier — eBay-issued device ID (e.g. "19de84291b7..."). Used in body
   * and as part of the `X-EBAY-C-ENDUSERCTX` header.
   */
  deviceId: string;
  /** Identifier — session GUID. Used in `X-EBAY-C-TRACKING` and `X-EBAY-C-CORRELATION-SESSION` headers. */
  guid: string;
  /** SECRET — hex-encoded HMAC-SHA512 signing key (Frida-extracted from CCHmac call). */
  hmacKey: string;
  /** Identifier — Apple advertising identifier (UUID). */
  idfa: string;
  /** Identifier — Apple vendor identifier (UUID). */
  idfv: string;
}

/**
 * Decrypted shape of `mobile_profile.credentials` for a shop.app iOS persona.
 *
 * **Auth scheme: refresh token.** None of the fields below are secrets —
 * they're device-identity headers shop.app expects on every call for
 * behavioral consistency. The actual server-recognized secret is the refresh
 * token issued by the first `SignInAsGuest` call, which lives in
 * `mobile_profile.refresh_token` (not in `credentials`).
 *
 * Encrypting this blob anyway is defense-in-depth — even though no individual
 * field is a secret, the *combination* uniquely identifies a captured device
 * and we'd rather not leak the inventory.
 */
export interface ShopRefreshTokenCredentials {
  /** Identifier — per-install UUID (e.g. "3C47583A-..."). Sent as `x-device-id`. */
  deviceId: string;
  /** Identifier — hardware UUID (Apple uppercase format). Sent as `x-device-id-hw`. */
  deviceIdHw: string;
  /** Identifier — display name shown to shop.app (e.g. "Apple iPhone XR"). Sent as `x-device-name`. */
  deviceName: string;
}

/**
 * Union of credential shapes per app. The blob carries no in-line
 * discriminator — `mobile_profile.app` (the column) is the single source of
 * truth. Adapter code decrypts `mobile_profile.credentials`, JSON-parses it,
 * and narrows by switching on `profile.app`.
 *
 * Each variant declares its auth scheme in the type name — `Hmac` for the
 * HMAC-signing flow (eBay), `RefreshToken` for the refresh-token flow (shop).
 * Adding a new app = add a new variant. No schema migration needed
 * (the column is opaque text from Postgres's POV).
 */
export type MobileCredentials =
  | EbayHmacCredentials
  | ShopRefreshTokenCredentials;
