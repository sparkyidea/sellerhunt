---
title: Adapter Token Storage
impact: HIGH
tags: [data, adapters, tokens, auth, schema, drizzle, encryption]
---

## Adapter Token Storage

**Impact: HIGH**

How long-lived credentials and short-lived bearers persist for adapter packages. Two distinct table patterns; do not unify them. For the package-side auth schemes see `patterns-adapter-auth.md`.

### Decision matrix

| Auth scheme | Table pattern | Cardinality | Examples today |
|---|---|---|---|
| **API key** (static, app-level) | none (deployment env, passed by caller) | n/a | none since the split |
| **Refresh token — user-owned** (OAuth grant per real user) | `<resource>_token` | 1:1 with the authenticated resource | none since the split (`channel_token` was removed with the official marketplace stack; pattern kept for future adapters) |
| **HMAC** (signing key per persona) + **Refresh token — app-owned** (guest session per persona) | `<resource>_profile` | N rows, claimed per app/box | `mobile_profile` |

Decision tree for a new adapter:

```
Is there per-row state (per-user, per-persona)?
├── No  → API key, caller resolves from env, no table
└── Yes
    ├── Real user OAuthed against the upstream?
    │   → <resource>_token (Refresh token, user-owned)
    └── App-owned persona (Frida-captured device, signing key, or guest session)?
        → <resource>_profile (HMAC and/or Refresh token, app-owned)
```

### Why two tables, not one

The two table shapes look similar (both hold an `access_token` + expiry) but model genuinely different things:

| | `<resource>_token` (Refresh token, user-owned) | `mobile_profile` (HMAC / Refresh token, app-owned) |
|---|---|---|
| Ownership | User-bound (FK to channel) | App-owned (no user FK) |
| Lifecycle | Created when user OAuths; killed if user revokes | Provisioned by ops; killed when persona's stable secret dies |
| Per-marketplace cardinality | 1 row per channel (per user) | N rows (pool, rotated per request) |
| What's in `credentials` | n/a — the refresh token itself is the stable secret, stored in `refresh_token` | Per-marketplace blob: HMAC signing key (eBay) or device-identity headers (shop) |
| `refresh_token` column | Always populated (it IS the OAuth grant) | Populated only when the upstream issues one (shop yes, eBay no) |
| Derivation on expiry | OAuth refresh-token grant | HMAC-sign + POST (eBay) OR refresh-token grant if cached + persona mint as fallback (shop) |
| Health tracking | None — if dead, user re-auths | `status`, `cooldown_until`, `failure_count` |
| Failure routing | 401 → surface to user | 401 on data call → evict bearer; 401 on derivation → mark persona dead, fail the run; next attempt may claim a replacement |

Forcing them into one table costs either schema-level type safety (sparse columns) or the schema-level distinction between "user-owned auth" and "ops-managed scraper persona."

#### The "stable secret" concept across both tables

Both patterns store *something stable that proves possession of an upstream auth right* plus *something ephemeral that caches the derived bearer*. The shape and location of the "stable secret" differs:

- **Refresh token user-owned**: the refresh token IS the stable secret. Lives in `<resource>_token.refresh_token`. The OAuth endpoint validates it directly.
- **HMAC**: the signing key is the stable secret. Lives in `<resource>_profile.credentials` (encrypted). Every mint signs a fresh timestamp with it.
- **Refresh token app-owned**: after the first persona-mint (e.g. shop's `SignInAsGuest`), the upstream-issued refresh token is the stable secret. Lives in `<resource>_profile.refresh_token`. The persona's device-identity headers in `credentials` are NOT secrets — they're behavioral consistency fingerprints.

This is why `<resource>_profile.refresh_token` is nullable: HMAC personas never have one (eBay); refresh-token-app-owned personas only have one after their first mint.

### Why `credentials` is text, NOT jsonb

The `credentials` column on `<resource>_profile` holds an **encrypted JWE ciphertext** — opaque bytes from `encryptSecret()`. The JSON shape only exists in memory after decryption:

```
write:  TS object → JSON.stringify → encryptSecret → text column (ciphertext)
read:   text column (ciphertext) → decryptSecret → JSON.parse → TS object
```

Postgres `jsonb` requires the column value to be **valid, parseable JSON.** An encrypted ciphertext is just a base64-ish string — not parseable. The DB can't index it, can't query into it, can't validate it. So `jsonb` literally wouldn't work without ditching encryption.

This is why `access_token`, `refresh_token`, and `credentials` are all `text`: same encryption pattern, same constraint. If you ever do want queryable plaintext per-persona identifiers (e.g. find by `deviceId` in an ops query), the right move is a sibling `metadata jsonb` column, leaving `credentials` as the encrypted secret blob. Don't try to split one column into "some plaintext, some encrypted."

### Column conventions (consistent across both patterns)

Both table types agree on these columns:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `access_token` | text (encrypted) | Cached short-lived bearer. `text` not `jsonb` for the same reason as `credentials`. |
| `access_token_expires_at` | timestamptz | When the cached bearer dies |
| `created_at`, `updated_at` | timestamptz | Auto-managed |

**Refresh token — user-owned (`*_token`) adds:**

| Column | Type | Notes |
|---|---|---|
| `<resource>_id` | uuid (FK) | The resource this token authenticates |
| `refresh_token` | text (encrypted) | OAuth refresh token — IS the stable secret |
| `refresh_token_expires_at` | timestamptz nullable | Null when the upstream's refresh tokens don't expire (Shopify offline access) |

**HMAC / Refresh token app-owned (`*_profile`) adds:**

| Column | Type | Notes |
|---|---|---|
| `capture` | text nullable | Stable seed identity within an app; independent of box assignment. |
| `label` | text nullable | Owning box; NULL until claimed. Dead rows retain it as history. |
| `claimed_at` | timestamp nullable | Time the persona was assigned to its box. |
| `app` | text | Which mobile app this persona impersonates (e.g. "ebay", "shop"). Single source of truth for narrowing `MobileCredentials` at read time — the blob itself carries no in-line tag. |
| `credentials` | text (encrypted) | Per-persona auth-material blob. Encrypted JWE; decrypts to a per-app TS shape (see `MobileCredentials` for the union). Contents are scheme-specific — HMAC key + identifiers for eBay; identity-only for shop. |
| `refresh_token` | text (encrypted) nullable | Cached upstream-issued refresh token from a prior mint. Null for HMAC-only personas (eBay). Distinct from `credentials` because this value *rotates* per mint cycle. |
| `refresh_token_expires_at` | timestamptz nullable | Refresh-token TTL when the upstream surfaces one. Null means "try until rejected." |
| `status` | enum (`active` \| `dead`) | Pool inclusion flag |
| `cooldown_until` | timestamptz nullable | Soft-failure cooldown |
| `failure_count` | int | Consecutive failures; promote to `dead` past a threshold |

The shared `access_token` + `access_token_expires_at` columns let the TS contract overlap:

```ts
interface CachedBearer {
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
}
// Both SelectChannelToken and SelectMobileProfile satisfy CachedBearer.
```

The `refresh_token` + `refresh_token_expires_at` pair has the same shape on both tables, even though the semantics differ. The columns line up — managers can share TS helpers for "decrypt refresh token, check expiry."

### Encryption rule

Everything in `access_token`, `refresh_token`, and `credentials` is encrypted at rest with `env.ENCRYPTION_SECRET` via `encryptSecret`/`decryptSecret` in `apps/trigger-scan/src/utils/secret-crypto.ts`. Never write plaintext into these columns.

### The TokenManager loop (shared shape, separate implementations)

Both managers run the same control flow: try the cheapest available proof first, fall back to the more expensive one if it fails.

```
get_bearer_for_request():
  cached = read_cached_bearer()                  # decrypt access_token, check expires_at + buffer
  if cached:
    return cached

  # Prefer the cheaper "rotating secret" path if available.
  # User-owned: always — refresh_token IS the grant.
  # App-owned: only when a refresh_token has been cached from a prior mint (shop today).
  rotating = read_cached_refresh_token()
  if rotating AND marketplace_supports_refresh_grant():
    try:
      result = refresh_via_rotating_secret(rotating)
      persist_token_result(result)
      return result.accessToken
    catch:
      clear_cached_refresh_token()
      # fall through to stable-secret path

  # Stable-secret path.
  # User-owned: error (refresh failed and no fallback — surface to user).
  # HMAC: HMAC-sign + POST.
  # App-owned refresh token: fresh persona mint (SignInAsGuest for shop).
  stable = load_credentials()
  result = derive_from_stable_secret(stable)
  persist_token_result(result)                   # may include a newly-issued refresh_token
  return result.accessToken
```

Per-row failure routing differs by scheme:

- **Refresh token — user-owned**: 401 on refresh → user's grant is revoked; surface to user, no auto-recovery.
- **HMAC / Refresh token — app-owned**:
  - 401 on refresh-token path → clear cached refresh token, fall through to stable-secret derivation.
  - 401 on the stable-secret derivation → `markDead()` (the persona's stable secret is rejected); the run fails, and a later attempt may claim a replacement under the box lock.
  - 401 on a *data* endpoint → `markDataAuthFailure()` (bearer evicted; the persona's secrets still work).

Reference implementation:
- HMAC + Refresh token app-owned → `apps/trigger-scan/src/utils/mobile-profile-manager.ts` (`MobileProfileTokenManager` against `mobile_profile`)
- (The user-owned `TokenManager` against `channel_token` was removed in the split; the pattern above is kept for future OAuth adapters.)

### When NOT to add a table

API-key adapters have no per-user / per-persona state. The single app-level secret is resolved from env by the caller and passed into the adapter factory. Do not add a token table just because the package has the word "token" in its surface — only add one when there's per-row state to persist.

### Reference schemas

- `packages/db/src/schema/mobile-profile.ts` — `mobile_profile` (HMAC + Refresh token, app-owned)

Ownership acquisition, death transitions, and owned reseeding share the transaction-scoped
`(app, label)` advisory lock in `packages/db/src/mobile-profile-ownership.ts`. The partial
unique index enforces one active owner, including cooling personas. Reseeding a dead
owner whose replacement is active reports a conflict and preserves the dead row. See
[scan architecture](../../apps/trigger-scan/docs/scan-architecture.md#persona-ownership).
