# @dashseller/marketplace

Unified API for fetching e-commerce data from different marketplaces (eBay, Shopify, Amazon, etc.)

## Installation

```bash
bun add @dashseller/marketplace
```

## Quick Start

```typescript
import { createClient } from '@dashseller/marketplace';

// Create a marketplace client with OAuth tokens
const ebay = createClient('EBAY', {
  accessToken: 'your-access-token',
  refreshToken: 'your-refresh-token',
});

// Fetch listings
const listings = await ebay.getListings();

// With filters and pagination
const activeListings = await ebay.getListings({
  status: 'active',
  limit: 50,
  offset: 0,
});

// Get seller information
const userInfo = await ebay.getUserInfo();

// Refresh tokens when expired
await ebay.refresh();
```

## Features

✅ **Factory Pattern** - Simple, consistent client creation
✅ **Type Safety** - Full TypeScript support with inference
✅ **Normalized Data** - Consistent response shapes across all platforms
✅ **Pagination** - Offset and cursor-based pagination
✅ **Token Management** - Built-in token refresh
✅ **Flexible Filtering** - Platform-agnostic and platform-specific options

## API Reference

### `createClient(marketplace, config)`

Create a marketplace client instance.

**Parameters:**

- `marketplace` - Marketplace identifier (`'EBAY'`, `'SHOPIFY'`, `'AMAZON'`)
- `config` - Client configuration object

```typescript
interface ClientConfig {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
}
```

**Returns:** `BaseAdapter` instance

**Example:**

```typescript
const ebay = createClient('EBAY', {
  accessToken: 'v^1.1#xxx',
  refreshToken: 'v^1.1#yyy',
  accessTokenExpiresAt: new Date('2024-12-31'),
  refreshTokenExpiresAt: new Date('2025-12-31'),
});
```

### Client Methods

#### `getListings(options?)`

Fetch listings from the marketplace.

**Parameters:**

```typescript
interface GetListingsOptions {
  limit?: number;           // Max items per request (default: 50)
  cursor?: string;          // Cursor for next page
  offset?: number;          // Offset-based pagination
  status?: string;          // Filter by status ('active', 'ended', 'sold')
  [key: string]: unknown;   // Platform-specific options
}
```

**Returns:** `Promise<Listing[]>`

**Examples:**

```typescript
// Basic usage
const listings = await ebay.getListings();

// With limit
const first50 = await ebay.getListings({ limit: 50 });

// With pagination
const page2 = await ebay.getListings({ limit: 50, offset: 50 });

// Filter by status
const activeListings = await ebay.getListings({ status: 'active' });
```

#### `getUserInfo()`

Get seller/store information.

**Returns:** `Promise<MarketplaceUserInfo>`

```typescript
interface MarketplaceUserInfo {
  reference: string;      // Immutable marketplace user ID
  displayName: string;    // Business name or username
}
```

**Example:**

```typescript
const userInfo = await ebay.getUserInfo();
console.log(`Seller: ${userInfo.displayName} (${userInfo.reference})`);
```

#### `refresh()`

Refresh expired access token using refresh token.

**Returns:** `Promise<TokenResponse>`

```typescript
interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;                // seconds
  refreshTokenExpiresIn: number;    // seconds
  tokenType: string;
}
```

**Example:**

```typescript
// Refresh token (updates internal tokens automatically)
const newTokens = await ebay.refresh();

// Get updated tokens
const currentAccessToken = ebay.getAccessToken();
const currentRefreshToken = ebay.getRefreshToken();
```

#### `getMarketplaceId()`

Get the marketplace identifier.

**Returns:** `string` (e.g., `"ebay"`, `"shopify"`)

```typescript
const marketplaceId = ebay.getMarketplaceId(); // "ebay"
```

## Data Types

### Listing

Normalized listing data structure.

```typescript
interface Listing {
  // Product fields
  categoryId: string | null;
  title: string | null;
  description: string | null;
  brand: string | null;
  manufacturer: string | null;
  condition: string | null;
  imageUrls: string[] | null;
  variations: boolean;

  // Listing-specific fields
  reference: string | null;           // Marketplace listing ID
  subTitle: string | null;
  type: string | null;                // e.g., "FixedPriceItem"
  url: string | null;
  status: string | null;              // "ACTIVE", "ENDED", "SOLD"

  // Pricing
  offers: boolean | null;
  offerAcceptPrice: number | null;    // cents
  offerDeclinePrice: number | null;   // cents

  // Shipping & Returns
  domesticReturn: boolean | null;
  domesticReturnWindow: number | null;
  domesticShippingBaseFee: number | null;    // cents
  handlingTime: number | null;

  // Dates
  startedAt: Date | null;
  endedAt: Date | null;

  // Variants
  listingVariants: ListingVariant[];
}
```

### ListingVariant

Product variant with inventory data.

```typescript
interface ListingVariant {
  // Product variant fields
  sku: string | null;
  model: string | null;
  upc: string | null;
  attributes: Record<string, string> | null;   // e.g., {"Color": "Red", "Size": "M"}
  price: number | null;                        // cents

  // Dimensions & weight
  length: number | null;    // millimeters
  width: number | null;     // millimeters
  height: number | null;    // millimeters
  weight: number | null;    // milligrams

  imageUrls: string[] | null;

  // Listing-specific fields
  reference: string | null;
  quantity: number | null;
  sold: number | null;
}
```

## Platform-Specific Notes

### eBay

- Uses Trading API for comprehensive inventory access
- Supports both single items and multi-variant listings
- Automatic conversion of dimensions (inches → mm) and weight (oz → mg)
- Status mapping: `Active` → `"ACTIVE"`, `Completed` → `"SOLD"`, `Ended` → `"ENDED"`

**Pagination:**
- Uses offset-based pagination internally
- Max 200 items per request
- Calculate page: `page = Math.floor(offset / limit) + 1`

### Future Platforms

Shopify and Amazon adapters will follow the same interface pattern.

## Advanced Usage

### Token Refresh Flow

```typescript
// Check if token is expired
const { accessTokenExpiresAt } = ebay.getTokenExpiration();
const isExpired = accessTokenExpiresAt && accessTokenExpiresAt < new Date();

if (isExpired) {
  // Refresh tokens
  const newTokens = await ebay.refresh();

  // Save to database
  await db.update(channelToken)
    .set({
      accessToken: await encryptSecret(newTokens.accessToken),
      refreshToken: await encryptSecret(newTokens.refreshToken),
      accessTokenExpiresDate: new Date(Date.now() + newTokens.expiresIn * 1000),
    })
    .where(eq(channelToken.channelId, channelId));
}
```

### Pagination

```typescript
async function fetchAllListings() {
  const allListings = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const listings = await ebay.getListings({ limit, offset });
    allListings.push(...listings);

    if (listings.length < limit) break; // No more pages
    offset += limit;
  }

  return allListings;
}
```

### Error Handling

```typescript
try {
  const listings = await ebay.getListings();
} catch (error) {
  if (error.code === 'TOKEN_EXPIRED') {
    // Refresh token and retry
    await ebay.refresh();
    const listings = await ebay.getListings();
  } else {
    // Handle other errors
    console.error('Failed to fetch listings:', error);
  }
}
```

## Utility Functions

### Unit Converters

```typescript
import {
  convertToMillimeters,
  convertToMilligrams,
  convertToInches,
  convertToOunces,
} from '@dashseller/marketplace';

// Convert dimensions
const mm = convertToMillimeters(13, 'inches');  // 330 mm
const inches = convertToInches(330, 'mm');      // 13 inches

// Convert weight
const mg = convertToMilligrams(12, 'oz');       // 340,194 mg
const oz = convertToOunces(340194, 'mg');       // 12 oz
```

### Token Helpers

```typescript
import {
  generateState,
  calculateExpirationDate,
  isTokenExpired,
} from '@dashseller/marketplace';

// Generate CSRF state for OAuth
const state = generateState(); // Random 32-char string

// Calculate expiration date
const expiresAt = calculateExpirationDate(7200); // 2 hours from now

// Check if token is expired
const expired = isTokenExpired(expiresAt); // boolean
```

### Encryption

```typescript
import { encryptSecret, decryptSecret } from '@dashseller/marketplace';

// Encrypt sensitive data for storage
const encrypted = await encryptSecret('my-access-token', process.env.ENCRYPTION_SECRET);

// Decrypt when needed
const decrypted = await decryptSecret(encrypted, process.env.ENCRYPTION_SECRET);
```


## Contributing

When adding a new marketplace adapter:

1. Create a new directory in `src/adapters/<marketplace>/`
2. Create adapter class implementing `BaseAdapter` interface
3. Implement all required methods: `getMarketplaceId()`, `getAccessToken()`, `getRefreshToken()`, `getListings()`, `getUserInfo()`, `refresh()`
4. Map marketplace data to normalized `Listing` format
5. Add marketplace to `MarketplaceType` union in `src/types.ts`
6. Add case to switch statement in `createClient()` factory function (`src/index.ts`)
7. Export adapter and related functions from `src/index.ts`
8. Add platform-specific documentation

## License

MIT
