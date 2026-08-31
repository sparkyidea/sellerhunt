# Marketplace Adapter Development Guide

## Overview

The marketplace package provides a unified `ApiClient` interface for interacting with different marketplaces (eBay, Shopify, Amazon). Each marketplace adapter normalizes API responses into shared types that mirror our database schema.

Consumers create clients through the factory — never by importing marketplace-specific classes directly:

```ts
const client = createApiClient("ebay", {
  accessToken: "...",
  refreshToken: "...",
});

const listings = await client.getListings({ limit: 50 });
const channel = await client.getChannel();
```

## Building a New Adapter Method

Follow this three-step process: explore, build, verify.

### Step 1: Explore the API in Sandbox

Use `sandbox/<marketplace>/direct-api/` to call the raw marketplace API and inspect the response shape.

**Example — eBay listings:** There were multiple candidate endpoints:
- `GetItem` — fetches a single listing by ID (detailed)
- `GetSellerList` — fetches listings in bulk with pagination

We wrote `sandbox/ebay/direct-api/get-seller-list.ts` to call the API directly and dump the raw JSON to `direct-api/output/get-seller-list.json`. This let us:
- See the actual response structure (the SDK types were incomplete — `HasMoreItems` was missing)
- Understand field types at runtime (`ItemID` was `number`, not `string` as the SDK typed it)
- Decide which endpoint to use (`GetSellerList` for bulk + `GetItem` per item for full details)

```
bun run packages/marketplace/sandbox/ebay/direct-api/get-seller-list.ts
```

### Step 2: Build the Adapter Method

Once the endpoint is chosen, build the adapter method in `src/adapters/<marketplace>/`.

#### File Structure

```
src/adapters/ebay/
├── sdk.ts                          # Raw ebay-api SDK client factory (shared)
├── api/
│   ├── client.ts                   # EbayApiClient implements ApiClient
│   ├── get-channel.ts              # Adapter method — fetches seller info
│   ├── get-listings.ts             # Adapter method — orchestrates listing API calls
│   ├── get-orders.ts               # Adapter method — fetches orders
│   ├── mapper/
│   │   ├── map-channel.ts          # Raw response → Channel type
│   │   ├── map-listing.ts          # Raw response → Listing type
│   │   ├── map-order.ts            # Raw response → Order type
│   │   └── map-variants.ts         # Variations → ListingVariant[]
│   └── helpers/
│       ├── extract-brand.ts        # eBay-specific: brand from ItemSpecifics
│       ├── extract-price.ts        # eBay-specific: normalizes price fields
│       ├── extract-dimensions.ts   # eBay-specific: dimensions from ShippingPackageDetails
│       └── generate-variant-reference.ts # eBay-specific: generates variant IDs
├── auth/
│   ├── client.ts                   # EbayAuthClient implements AuthClient
│   ├── generate-auth-url.ts        # Generates OAuth authorization URL
│   ├── exchange-code-for-tokens.ts # Exchanges auth code for tokens
│   └── refresh-access-token.ts     # Refreshes expired access tokens
└── types/                          # SDK type patches (temporary)
```

#### Where code goes

- **`api/`** — `ApiClient` class and its methods. Each method file orchestrates API calls and delegates to mappers. The `api/mapper/` and `api/helpers/` folders are co-located here since they only serve API methods.

- **`auth/`** — `AuthClient` class and its methods. Each auth operation (generate URL, exchange code, refresh token) is a separate file named after the function it exports.

- **`api/mapper/`** — Transforms raw API responses into our normalized types (`Listing`, `Channel`, `Order`). One mapper per adapter method. Mappers should be pure functions with no API calls.

- **`api/helpers/`** — Marketplace-specific extraction logic used by mappers. These handle quirks of the API (e.g., price can be `number` or `{ value, currencyID }`, ItemSpecifics can be a single object or array).

- **`src/utils/`** — General-purpose utilities shared across all marketplace adapters. Unit conversion (`convertToMillimeters`, `convertToMilligrams`), status mapping, and other logic that isn't tied to a specific marketplace.

**Rule of thumb:** If the logic handles a marketplace API quirk → `helpers/`. If it's reusable across marketplaces → `utils/`.

#### Example: `get-listings.ts`

The adapter method orchestrates the flow:

1. Call `GetSellerList` to get item IDs for a page
2. Call `GetItem` in parallel for full details per item
3. Pass each raw item through `mapListing()` which uses helpers and mapper functions
4. Return normalized `Listing[]`

#### Example: `get-channel.ts`

Simpler flow:

1. Call eBay Commerce Identity API to get user info
2. Pass response through `mapChannel()` to extract `reference` and `displayName`
3. Return normalized `Channel`

### Step 3: Verify with Sandbox Adapter Test

Use `sandbox/<marketplace>/adapter/` to test the full path through the `ApiClient` factory:

```ts
// sandbox/ebay/adapter/get-listings.ts
const client = createApiClient("ebay", {
  accessToken: creds.accessToken,
  refreshToken: creds.refreshToken,
});

const listings = await client.getListings({ limit: 5 });
```

This verifies:
- The factory correctly creates the client
- The adapter method calls the right API endpoints
- The mappers produce the expected normalized output
- The output matches our database schema types

```
bun run packages/marketplace/sandbox/ebay/adapter/get-listings.ts
```

Output is written to `sandbox/ebay/adapter/output/` for inspection.

## Sandbox Setup

Each marketplace sandbox has a `setup.ts` that loads credentials from the database using a channel ID set in `sandbox/.env`:

```
EBAY_CHANNEL_ID=y9qonyvfrqq
```

Two folders per marketplace:
- `direct-api/` — Raw API calls, dumps unprocessed JSON for exploration
- `adapter/` — Uses `createApiClient()` factory, outputs normalized data

## Adding a New Marketplace

1. Define any new config types in `src/types.ts` if the auth shape differs
2. Implement `AuthClient` in `src/adapters/<marketplace>/auth/` and `ApiClient` in `src/adapters/<marketplace>/api/`
3. Add the marketplace to the factory switch in `src/index.ts`
4. Add sandbox scripts for both direct API and adapter testing
5. Reuse `src/utils/` for shared logic; create `api/helpers/` for marketplace-specific extraction
