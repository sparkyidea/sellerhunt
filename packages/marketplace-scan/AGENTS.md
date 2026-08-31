# Marketplace Scan Adapter Development Guide

## Overview

This package targets **other sellers' data** on a marketplace — competitor
listings, public seller stats, public search results — for the scanner
workflows. It's the read-only counterpart to
`@dashseller/marketplace`, which talks to OAuth-authorized accounts (the
seller's own listings/orders).

Key differences from `marketplace`:

- **Mobile/unofficial APIs** (eBay's iOS app endpoints), not the public
  Browse API. Surfaces fields the public API doesn't expose
  (`itemSold`, `soldIn24h`, per-variant sold/watch counts, etc.).
- **Bearer auth via mobile device persona** — the iOS app's `device_credentials`
  grant. Long-lived signing material (Frida-captured per device) lives in
  the `mobile_profile` table; bearers are minted on demand and cached on
  the row. No OAuth.
- **JSON shape can change without notice.** A typegen pipeline guards the
  parsers against drift.
- **Read-only by design.** Never wire write paths through this package.

Consumers create clients through the factory:

```ts
import { createScanClient } from "@dashseller/marketplace-scan";

const client = createScanClient("ebay", {
  getAuthToken: async () => bearer,
});

const { listings } = await client.searchListings({ keyword: "toy" });
const { seller } = await client.getSeller({ sellerId: "..." });
const sellerListings = await client.getSellerListings({
  sellerId: "...",
  page: 1,
});
const { listing } = await client.getListing({ listingId: "..." });
```

`searchListings` and `getSellerListings` return the same shape — both
hit the search endpoint with a different filter (`_nkw=` vs `_ssn=`). Each
`ListingRef` carries the seller parsed from the search-card footer, so callers
that want unique seller usernames from a keyword search can derive them
without a second request:

```ts
const sellers = new Set(
  listings.flatMap((l) => (l.seller ? [l.seller.username] : []))
);
```

## Public API surface

The package only exports:

- `createScanClient(marketplace, config)` — factory
- `ScanClient`, `ScanClientConfig`, `ScanMarketplaceType` — interface + types
- `EbayScanClient` — concrete class (rare; prefer the interface)
- `ScanRequestError` — typed error for routing 401/403 vs 5xx
- All result + options types per method (for downstream typing)

Standalone adapter functions are **not** exported. Callers go through the
factory. Sandbox scripts use relative imports (`../../src/adapters/ebay/...`)
to reach them directly.

## Building a New Adapter Method

Same explore/build/verify rhythm as `marketplace`, plus a typegen step.

### Step 1 — Capture a curl from the iOS app

Use mitmproxy + iOS Simulator (or a real device with a proxy CA installed)
to capture a real iOS app request. Save the curl to `.context/attachments/`
for posterity.

### Step 2 — Build the standalone function

Create `src/adapters/<marketplace>/<method-name>.ts`:

- Define `Options` type (must include `authToken: string`).
- Define `Result` type — include `raw` for sandbox debugging plus the parsed
  shape for callers.
- Export the standalone function.
- Throw `ScanRequestError` (not bare `Error`) on non-2xx — the manager
  routes on its `.status`.

Don't add the method to `ScanClient` interface yet — sandbox-test first.

### Step 3 — Sandbox-test against live API

Create `sandbox/<marketplace>/<method-name>.ts`:

- Loads a persona via `_auth.ts` (mints a bearer from `<marketplace>/profiles/`).
- Calls the standalone function.
- Dumps raw response to `sandbox/<marketplace>/output/<method>.raw.json`.
- Prints parsed result for visual inspection.

```bash
bun run packages/marketplace-scan/sandbox/ebay/<method-name>.ts
```

### Step 4 — Refine the parser

Inspect the raw dump in `sandbox/<marketplace>/output/`. Walk the JSON to
find the fields you need. Update the parser. Re-run sandbox until output
looks right.

### Step 5 — Regenerate typegen

When the response shape settles:

```bash
bun run packages/marketplace-scan/sandbox/ebay/typegen/regen.ts
```

This re-derives `src/adapters/ebay/raw-types/*-response.ts` from the latest raw
dumps. Update the parser to use the typed response (replace `unknown` with
the imported type — see `get-seller.ts` for an example).

If the new method targets a new endpoint, add a `ResponseSpec` to
`sandbox/ebay/typegen/regen.ts` so future runs cover it.

### Step 6 — Wire into the factory

- Add the method signature to `ScanClient` interface in `src/adapters/base.ts`.
- Implement in `EbayScanClient` (delegates to the standalone, awaits
  the provider for the bearer).
- Contract types (options, result) exposed via `src/adapters/base.ts` flow
  through `src/types.ts` automatically (re-exported there). The per-adapter
  auth orchestrators live at `src/adapters/<provider>/auth/get-token.ts`
  and are reached *only* via the `getScanToken` factory dispatcher in
  `src/index.ts`. Internal `get-new-token.ts` / `refresh-token.ts` siblings
  hold the protocol-specific work; nothing outside `src/index.ts` and the
  sandbox scripts should import them directly.

### Step 7 — Verify through the factory

Run `sandbox/<marketplace>/factory-demo.ts` (or write a similar end-to-end
script) to confirm the full path through `createScanClient`.

## File Structure

```
src/
├── adapters/
│   ├── base.ts                          ScanClient interface, ScanClientConfig, ScanMarketplaceType
│   └── ebay/
│       ├── client.ts                    EbayScanClient class
│       ├── auth/
│       │   ├── get-token.ts             orchestrator — public entry for getScanToken
│       │   ├── get-new-token.ts         internal — HMAC-signed device_credentials grant
│       │   └── sign-device-signature.ts internal — HMAC helper for mint
│       ├── api/
│       │   ├── helper/search.ts         shared helpers for the keyword + seller search endpoint
│       │   ├── get-listing.ts           one listing → parsed Listing
│       │   ├── search-listings.ts       keyword → page of ListingRef (search filtered by _nkw=)
│       │   ├── get-seller-listings.ts   seller  → page of ListingRef (search filtered by _ssn=)
│       │   └── get-seller.ts            seller  → parsed Seller (storefront record)
│       └── raw-types/                   AUTO-GEN (typegen pipeline) — upstream response shapes
│           ├── search-response.ts
│           ├── storefront-response.ts
│           └── listing-detail-response.ts
├── types.ts                             public types entry (re-exports ScanClient + supporting types)
├── errors.ts                            ScanRequestError typed error
└── index.ts                             factories — createScanClient + getScanToken

sandbox/
├── .env                                 NOT in git — bearer + headers
├── .env.example
└── ebay/
    ├── get-listing.ts                   direct standalone call (for raw inspection)
    ├── search-listings.ts
    ├── get-seller-listings.ts
    ├── get-seller.ts
    ├── output/                          NOT in git — raw + parsed dumps
    └── typegen/
        ├── regen.ts                     regenerate typed response shapes
        └── .scratch/                    quicktype intermediate output
```

## Errors

All adapter HTTP failures throw `ScanRequestError` with:

- `.status` — HTTP status code
- `.endpoint` — short identifier of the adapter endpoint (for logs)
- `.body` — first 500 chars of response body
- `.isAuthFailure()` — true for 401/403
- `.isTransientFailure()` — true for 429/5xx

Trigger workflows route on these to decide bearer cache eviction vs.
cooldown. See `MobileProfileTokenManager` in
`packages/trigger-scan/src/utils/mobile-profile-manager.ts`.

## Auth — the mobile device-persona pool

Long-lived device credentials live in `mobile_profile` (in
`@dashseller/db/schema`); short-lived bearers are minted on demand and
cached on the row. The factory takes `getAuthToken: () => Promise<string>`
so the wiring layer decides where the token comes from:

- **Sandbox**: `sandbox/<app>/_auth.ts` loads a persona file from
  `sandbox/<app>/profiles/` and mints a fresh bearer via `getScanToken`
  (`EBAY_PROFILE` / `SHOP_PROFILE` selects which file).
- **Trigger workflow**: from `MobileProfileTokenManager.loadNextActive("ebay")`,
  which queries the `mobile_profile` pool (LRU among active rows, skips
  cooldown), reuses the cached bearer until it nears expiry, and re-mints
  via `getAuthToken` when needed.

Encryption: `mobile_profile.credentials` (the device persona) and
`mobile_profile.access_token` (cached bearer) are JWE blobs encrypted with
`env.ENCRYPTION_SECRET` — same convention as `channel_token`. The manager
handles the round-trip; sandbox scripts that bypass the manager work with
plaintext bearers.

Personas live as per-file captures under `sandbox/<app>/profiles/w-NNNNN.json`
(one credentials object per file) — the single source of truth read by both
the sandbox scripts and the seed. The directories are git-ignored; see each
`sandbox/<app>/profiles/README.md`. Per app:

- **eBay** (`sandbox/ebay/profiles/`) — `EbayHmacCredentials`: capture
  `hmacKey` by hooking CCHmac on a real iOS device, plus `clientId`,
  `device4pp`, `idfa`, `idfv`, `deviceId`, `guid` from a mitmproxy capture.
- **shop** (`sandbox/shop/profiles/`) — `ShopRefreshTokenCredentials`:
  `deviceId`, `deviceIdHw`, `deviceName` from a single shop.app curl (no HMAC
  capture; the real secret is the refresh token shop mints, stored on the row).

Then `bun run packages/db/src/seed/mobile-profile.ts` — loads every file
across all apps, upserts by `(app, label)` with `label` = filename stem and
`app` = the directory's app, encrypts the persona, and resets pool state on
re-run.

Sandbox scripts pick a persona from the same directory: default is the first
file, override with `EBAY_PROFILE=w-00003` / `SHOP_PROFILE=w-00001` (or
`…=random`). There is no persona env var — the directory is the only source.

## Adding a New Marketplace

1. Capture iOS-app curls for the equivalent endpoints (search, seller stats,
   seller listings, item detail).
2. Build the four standalone functions in `src/adapters/<new-marketplace>/`.
3. Add a `<New>ScanClient` class implementing `ScanClient`.
4. Add the marketplace to the `switch` in `src/index.ts`'s factory.
5. Add the new marketplace string to `ScanMarketplaceType` in `src/adapters/base.ts`.
6. Add a sandbox folder + factory-demo script.
7. Add a `ResponseSpec` to a typegen `regen.ts` for shape-drift protection.

## Caveats Worth Remembering

- **Mobile JSON shape changes silently.** Re-run typegen after any failed
  field extraction to confirm whether the shape moved.
- **Bearers rotate fast.** A test failing with 401 may just mean the
  captured token aged out — re-capture before assuming a code bug.
- **eBay's pagination lies past `totalPages`.** The endpoint keeps returning
  recycled / recommendation results past the real end. Use
  `meta.pagination.totalPages` not `listings.length === 0` as the stop
  signal. (Verified: walking blindly went 615 pages on a seller whose real
  count was 9.)
- **`itemSold` comes from `vls.listingProperties[].TOTAL_SOLD_QUANTITY`.** It's
  the listing-level lifetime total — present on every listing sampled (~42,
  single-item and multi-variant; emits `0` for unsold) and equal to the sum of
  every variant's `soldQuantity` on MSKU listings. `extractItemSold`
  (helper/`extract-sold-count.ts`) reads it, falling back to
  `vls.userToListingRelationshipSummary…propertyDetails.numberOfItemsSold` only
  if the property is absent. Do NOT source it from the
  `buyingContext.hotnessSignals[].QTY_SOLD_TOTAL_SIGNAL` signal — eBay attaches
  that to <30% of listings, so reading it first/only silently dropped the count
  for the majority (the original bug); when present it just echoed
  `TOTAL_SOLD_QUANTITY`.
- **`soldIn24h` is best-effort.** eBay only surfaces a 24h hotness signal
  for high-velocity listings. Null result ≠ zero sold.

## See also

- `.agents/knowledge-base.md` — domain context for dashseller as a whole.
- `packages/marketplace/AGENTS.md` — sibling package for OAuth-authorized
  marketplace API access (the `ApiClient` factory).
- `packages/trigger-scan/src/utils/mobile-profile-manager.ts` — the pool manager
  that wires `mobile_profile` rows into the factory's `getAuthToken`,
  minting and caching bearers via `getAuthToken`.
- `packages/db/src/schema/scan.ts` — `scan_seller`, `scan_listing`,
  `scan_listing_variant`, `scan_listing_snapshot`, `scan_keyword`,
  `scan_config`.
- `packages/db/src/schema/mobile-profile.ts` — `mobile_profile` (device
  personas, generic across mobile apps; discriminated by the `app` column)
  plus the `MobileCredentials` discriminated union.
- `packages/db/src/seed/mobile-profile.ts` — seed script for inserting
  Frida-captured device personas into the pool.
