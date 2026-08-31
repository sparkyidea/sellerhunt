---
title: Adapter Auth Patterns
impact: HIGH
tags: [patterns, adapters, auth, credentials, tokens, oauth, hmac]
---

## Adapter Auth Patterns

**Impact: HIGH**

Pick one of three auth schemes for a new adapter based on what the upstream's mobile/API auth model actually is. The scheme determines which functions the adapter exports, where refresh logic lives, and what the caller persists.

For explicit-credential package boundaries see `patterns-adapter-package.md`. For the per-adapter file layout (`http.ts`, `auth/`, `api/`) see `patterns-adapter-package-structure.md`. For the DB-side persistence shapes see `data-adapter-token-storage.md`.

### The three schemes

| Scheme | Stable secret | Per-call work | Storage | Examples today |
|---|---|---|---|---|
| **API key** | the key itself | none (verbatim) | deployment env, passed by caller | none today (the geo / shipment-tracking adapters used this before the split) |
| **HMAC** | signing key | compute HMAC(key, fresh_timestamp) before every mint | DB (persona pool, ops-managed) | `marketplace-scan` eBay (`hmacKey` Frida-extracted from iOS app) |
| **Refresh token** | server-issued refresh token | POST refresh_token grant → fresh access token | DB — `<resource>_token` (user-owned OAuth) or `<resource>_profile.refresh_token` (app-owned guest session) | `marketplace-scan` shop (`SignInAsGuest` → refresh token, app-owned). User-owned OAuth had no surviving example — the official `marketplace` package was removed in the split |

The decision tree:

```
Is there per-row state (per-user, per-persona)?
├── No  → API key, caller resolves from env, no DB
└── Yes
    ├── Is the stable secret server-rotatable via a refresh-token grant?
    │   ├── Yes, per-user (real user OAuthed against the upstream)
    │   │   → Refresh token (user-owned) — <resource>_token table
    │   └── Yes, per-persona (app mints anonymous sessions, e.g. SignInAsGuest)
    │       → Refresh token (app-owned) — <resource>_profile table
    └── Is the stable secret a signing key the app uses to sign every mint?
        → HMAC — <resource>_profile table (no refresh-token column needed)
```

### Per-adapter function convention

For HMAC and refresh-token-app-owned schemes, each adapter folder owns its protocol operations as internal files under `adapters/<provider>/auth/`, and exposes a single public orchestrator `get-token.ts` that internally decides between them. The package's factory (`src/index.ts`) wraps all orchestrators in a single `getScanToken(input)` dispatcher — callers never reach into per-adapter auth files.

```
adapters/ebay/auth/
  get-token.ts           → getToken(input)        public orchestrator (passthrough to get-new-token)
  get-new-token.ts       → getNewToken(creds)     internal — HMAC device_credentials grant

adapters/shop/auth/
  get-token.ts           → getToken(input)        public orchestrator (refresh → get-new-token fallback)
  get-new-token.ts       → getNewToken(creds)     internal — SignInAsGuest mint
  refresh-token.ts       → refreshToken(opts)     internal — refresh-token grant
```

eBay has no `refresh-token.ts` because no refresh-token grant exists in eBay's `device_credentials` flow — the asymmetry is encoded inside `get-token.ts` (eBay's orchestrator only ever calls `getNewToken`). The orchestrator entry is always named `get-token.ts` and always exports `getToken(input): Promise<ScanTokenResult>`.

The factory in `src/index.ts` adds a `getScanToken(input)` dispatcher alongside `createScanClient`. Callers import only from the package root:

```ts
import { createScanClient, getScanToken } from "@dashseller/marketplace-scan";
```

No `./ebay/get-token`, `./shop/refresh-token`, etc. sub-path exports — keeping the surface narrow forces all callers through the dispatcher.

### Scheme: API key

```ts
// Factory — explicit config only
export function createX(provider, config: XConfig): X {
  return new XClient(config);
}

// Caller — deployment boundary resolves the secret
const x = createX("provider", { apiKey: env.X_API_KEY });
```

No refresh. No DB. No per-user state. The simplest adapter.

### Scheme: HMAC

The stable secret (`hmacKey`) lives in `<resource>_profile.credentials` (encrypted). The adapter's internal `getNewToken` signs a fresh timestamp with it on every call — the signature proves possession of the key without ever transmitting it. There is no `refresh-token.ts` because no refresh-token grant exists in the upstream; `get-token.ts` is a trivial passthrough.

```ts
// adapters/ebay/auth/get-new-token.ts (internal)
export async function getNewToken(credentials: {
  clientId: string;
  hmacKey: string;     // SECRET
  device4pp: string;
  deviceId: string;
  guid: string;
  idfa: string;
  idfv: string;
}): Promise<TokenResult>;

// adapters/ebay/auth/get-token.ts (public orchestrator)
export async function getToken(input: { credentials: EbayCredentials }): Promise<TokenResult> {
  return getNewToken(input.credentials);  // no refresh path exists
}

// caller (mobile-profile-manager)
import { getScanToken } from "@dashseller/marketplace-scan";

const result = await getScanToken({ marketplace: "ebay", credentials });
await persistTokenResult(result);
```

The data client (`createScanClient`) is separate and stateless about credentials — it takes a `getAuthToken: () => Promise<string>` callback the manager wires to its cache+derive loop. Pool rotation, mark-dead / cooldown, and DB persistence live in the caller's manager (e.g. `MobileProfileTokenManager`). Failure routing: 401 on `getScanToken` means the signing key is rejected → mark the persona dead, fall through to the next persona in the pool.

eBay scan is the only HMAC adapter today.

### Scheme: Refresh token

The stable secret is the refresh token itself — sent verbatim to the upstream to swap for a fresh access token. Two sub-flavors, differing only in **storage** (who owns the rows), not in protocol:

#### Refresh token — user-owned (OAuth)

Per-user real OAuth grant. The user authorized our app against their seller account; we hold their access + refresh tokens. Storage: `<resource>_token`, 1:1 with the channel.

```ts
// Factory — app secrets and per-user tokens are caller-sourced
export function createApiClient(
  provider,
  config: ApiConfig  // accessToken + refreshToken REQUIRED from caller
): ApiClient {
  return new XApiClient({
    accessToken: config.accessToken,
    refreshToken: config.refreshToken,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });
}

interface ApiClient {
  // ...domain methods
  refreshToken(): Promise<TokenResult>;  // swap refresh_token for fresh tokens; caller persists
}
```

The client owns its tokens (one user, one client). On expiry the caller invokes `client.refreshToken()`, gets a `TokenResult` back, and persists it. Failure routing: 401 on refresh means the user revoked our access — surface to user, no auto-recovery.

#### Refresh token — app-owned (guest session)

The app mints an anonymous session against the upstream's "sign in as guest" endpoint; the response includes a refresh token we treat as the per-persona stable secret. Persona identity (device headers) lives in `<resource>_profile.credentials` for behavioral consistency on every call. The refresh token lives in `<resource>_profile.refresh_token` because it rotates per mint cycle while the identity headers don't.

```ts
// adapters/shop/auth/get-new-token.ts (internal) — SignInAsGuest mint (bootstrap / fallback)
export async function getNewToken(credentials: {
  deviceId: string;
  deviceIdHw: string;
  deviceName: string;
}): Promise<TokenResult>;

// adapters/shop/auth/refresh-token.ts (internal) — refresh-token grant (preferred when cached)
export async function refreshToken(options: {
  refreshToken: string;
  deviceId: string;
  deviceIdHw: string;
  deviceName: string;
}): Promise<TokenResult>;

// adapters/shop/auth/get-token.ts (public orchestrator)
export async function getToken(input: {
  credentials: ShopCredentials;
  refreshToken?: string | null;
}): Promise<TokenResult> {
  if (input.refreshToken) {
    try { return await refreshToken({ ...input.credentials, refreshToken: input.refreshToken }); }
    catch { /* fall through to get-new-token */ }
  }
  return await getNewToken(input.credentials);
}

// caller (mobile-profile-manager)
import { getScanToken } from "@dashseller/marketplace-scan";
```

Two internal protocol files, one public orchestrator. Failure routing: 401 on `refreshToken` → orchestrator silently falls back to `getNewToken`; 401 on `getNewToken` → propagates as `ScanRequestError` → caller marks the persona dead. The caller always persists the returned `ScanTokenResult` — the access and refresh tokens both rotate on every successful derivation (refresh-vs-new is invisible at the boundary).

### Caller flow — one dispatcher, adapter owns orchestration

The orchestration moved into the adapter — the manager no longer switches between mint and refresh. It supplies credentials + any cached refresh token, calls `getScanToken`, and persists the result:

```ts
private async deriveAndPersistBearer() {
  const credentials = await this.loadCredentials();
  const refreshToken = await this.readCachedRefreshToken();

  const result = await getScanToken(
    this.profile.app === "shop"
      ? { marketplace: "shop", credentials, refreshToken }
      : { marketplace: "ebay", credentials }
  );

  await this.persistTokenResult(result);
  return result.accessToken;
}
```

After deriving, the caller persists `result` (access + any newly-issued refresh token). When the shop mint runs, it returns a new refresh token in the result, which `persistTokenResult` writes to overwrite the stale cached one in the same DB UPDATE — no separate "clear stale" step needed.

**Imitating a real mobile-app session.** Real shop.app installs re-use their refresh token until it dies (~30d). Hitting `SignInAsGuest` once per access-token expiry would be 24× the network noise of a real user — a behavioral signal a sophisticated bot-detection layer can cluster on. Preferring the refresh-token path inside the orchestrator is the stealth-aware default.

### Why user-owned and app-owned refresh tokens stay separate

The *protocol* is identical (swap refresh_token for fresh access_token); the *storage and failure semantics* are not.

| Concern | User-owned (OAuth) | App-owned (guest session) |
|---|---|---|
| Who owns the row | One per user channel | Pool of N rows the app rotates across |
| What it means when it dies | User revoked → surface error | Persona burnt → mark dead, try next |
| Refresh-token rotation | Some upstreams rotate, some don't | Marketplace-specific (shop rotates) |
| Embed refresh logic in the client? | Yes — `client.refreshToken()` (one-user-one-client fits) | No — per-adapter standalone function; manager owns the pool, client is stateless |

Trying to unify them either forces every OAuth caller to write per-adapter-function boilerplate, or buries pool semantics inside the data client and tangles it with DB.

### Unified `TokenResult`

All refresh-path returns (user-owned `client.refreshToken()` and app-owned `getScanToken`) use the same shape:

```ts
interface TokenResult {
  accessToken: string;
  expiresAt: Date;              // absolute, not seconds-relative
  refreshToken?: string;        // present when the upstream issues one (OAuth providers; shop scan)
  refreshTokenExpiresAt?: Date; // present when the upstream surfaces a refresh-token TTL
  raw?: unknown;                // upstream response for debugging / shape-drift inspection
}
```

`expiresAt` is computed by the package (so callers persist a Date, not a `seconds-from-when` delta). Earlier marketplace shipped `expiresIn: number` — superseded; migrate to `expiresAt: Date`. `refreshTokenExpiresAt` is null today for shop (its `SignInAsGuest` response doesn't surface a refresh-token TTL); OAuth providers fill it in. The orchestrator deliberately does NOT surface whether refresh or mint ran — the caller always persists the same way, and refresh-path telemetry can be added later as a callback if ops needs it.

### Storage rule (cross-references `data-adapter-token-storage.md`)

- **API key (app-level)** → deployment env, resolved by caller and passed into factory
- **Refresh token (user-owned)** → DB `<resource>_token` (1:1 with the resource)
- **HMAC + Refresh token (app-owned)** → DB `<resource>_profile` (N rows, pooled). HMAC personas leave `refresh_token` null; app-owned-refresh-token personas populate it.

### Config rule

The factory always accepts a `config` object and never resolves secrets itself. Per-adapter auth functions take their credentials directly. App-level fields (API keys, OAuth client IDs/secrets) and row-level fields (OAuth access/refresh tokens, persona credentials) are all required from the caller. Tests and sandbox scripts pass explicit credentials as well.

### HTTP wrapper convention

Each adapter folder owns its `http.ts` (REST adapters) or equivalent (GraphQL adapters use the same naming with GraphQL semantics). The auth functions and api functions in that folder share the wrapper — ambient marketplace-wide headers (`User-Agent`, locale, marketplace IDs), `!ok → ScanRequestError`, and JSON parsing all live in one place. Per-endpoint headers (Accept variant, Bearer, GraphQL operation) are passed by the caller. See `patterns-adapter-package-structure.md` for the wrapper shape.

### References

- HMAC: `packages/marketplace-scan/src/adapters/ebay/auth/get-token.ts`, `packages/marketplace-scan/src/adapters/ebay/auth/get-new-token.ts`, `packages/marketplace-scan/src/adapters/ebay/http.ts`
- Refresh token (app-owned): `packages/marketplace-scan/src/adapters/shop/auth/get-token.ts`, `packages/marketplace-scan/src/adapters/shop/auth/get-new-token.ts`, `packages/marketplace-scan/src/adapters/shop/auth/refresh-token.ts`, `packages/marketplace-scan/src/adapters/shop/http.ts`, `packages/marketplace-scan/src/index.ts` (the `getScanToken` dispatcher), `packages/trigger-scan/src/utils/mobile-profile-manager.ts`
- API key and refresh-token-user-owned have no in-repo examples since the split; the pattern text above is kept for future adapters.
