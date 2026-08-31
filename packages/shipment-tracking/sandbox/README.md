# Shipment Tracking Sandbox

Scripts for testing tracking-provider adapters and raw API calls against live data.

## Setup

Create `sandbox/.env` (copy from `.env.example`):

```
PACKAGE_TRACKER_CREDENTIAL=<Bearer token captured from the Package Tracker iOS app>
SHIPPO_API_TOKEN=<shippo_test_* or shippo_live_*>
```

## Structure

```
sandbox/
├── package-tracker/          # api.ship24.com — Ship24 mobile (Package Tracker iOS)
│   ├── setup.ts
│   ├── adapter/
│   │   └── track.ts
│   └── direct-api/
│       └── track.ts
└── shippo/                   # api.goshippo.com — direct-api only (no adapter yet)
    ├── setup.ts
    └── direct-api/
        └── track.ts
```

- **adapter/** — Runs through our `@dashseller/shipment-tracking` package. Output matches the normalized `Tracking` shape (1:1 with the `tracking` table). Use this to verify the full mapping pipeline.
- **direct-api/** — Calls the upstream endpoint directly and dumps raw JSON. Use this to inspect the actual response shape and debug mapper bugs.

## Running

```bash
# Package Tracker (Ship24 mobile)
bun run packages/shipment-tracking/sandbox/package-tracker/adapter/track.ts <tracking_number>
bun run packages/shipment-tracking/sandbox/package-tracker/direct-api/track.ts <tracking_number>

# Shippo (direct-api only — used to inspect response shape before building an adapter)
bun run packages/shipment-tracking/sandbox/shippo/direct-api/track.ts <carrier> <tracking_number>
# Test mode examples (carrier "shippo"):
#   ... shippo SHIPPO_TRANSIT
#   ... shippo SHIPPO_DELIVERED
```

Output JSON files are written to `output/` directories within each folder (gitignored repo-wide via `**/sandbox/**/output/`).
