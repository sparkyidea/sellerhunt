# Marketplace Sandbox

Scripts for testing marketplace adapters and raw API calls against live data.

## Setup

1. Create `sandbox/.env` with your channel ID:

```
EBAY_CHANNEL_ID=<your-channel-id>
```

2. Ensure `apps/api/.env` has the required variables:

```
DATABASE_URL=<postgres-connection-string>
ENCRYPTION_SECRET=<encryption-key>
EBAY_CLIENT_ID=<ebay-client-id>
EBAY_CLIENT_SECRET=<ebay-client-secret>
```

## Structure

```
sandbox/
├── ebay/
│   ├── setup.ts              # Shared setup: loads env, fetches & decrypts tokens from DB
│   ├── adapter/              # Uses our marketplace adapter (normalized output)
│   │   └── get-listings.ts
│   └── direct-api/           # Calls eBay API directly (raw response)
│       └── get-seller-list.ts
```

- **adapter/** — Runs through our marketplace package. Output matches our DB schema structure. Use this to verify the full mapping pipeline.
- **direct-api/** — Calls the eBay Trading API directly and dumps raw JSON. Use this to inspect the actual API response shape and debug type mismatches.

## Running

```bash
# Adapter (normalized output)
bun run packages/marketplace/sandbox/ebay/adapter/get-listings.ts

# Direct API (raw response)
bun run packages/marketplace/sandbox/ebay/direct-api/get-seller-list.ts
```

Output JSON files are written to `output/` directories within each folder (gitignored).
