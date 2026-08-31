# Geo Sandbox

Scripts for testing the `@dashseller/geo` adapters against live upstream APIs.

## Setup

Create `sandbox/.env` (copy from `.env.example`):

```
GOOGLE_MAPS_API_KEY=<your Maps Platform key>     # for the google adapter
ROLLO_API_KEY=<captured from the Rollo iOS app>  # for the rollo adapter
```

## Structure

```
sandbox/
├── google/                            # Geocoder + Autocomplete via Google Maps Platform
│   ├── setup.ts
│   ├── adapter/                       # Through @dashseller/geo (normalized output)
│   │   ├── geocode.ts
│   │   ├── suggest.ts
│   │   └── get-place-details.ts
│   └── direct-api/                    # Raw Google API (provider-native output)
│       ├── geocode.ts
│       ├── suggest.ts
│       └── get-place-details.ts
└── rollo/                             # Geocoder (puzzled up) + Autocomplete (legacy Places via Rollo's iOS key)
    ├── setup.ts
    ├── adapter/                       # Through @dashseller/geo (normalized output)
    │   ├── geocode.ts                 # Text Search → Place Details → optional strict verify
    │   ├── suggest.ts
    │   └── get-place-details.ts
    └── direct-api/                    # Raw legacy Places API + probes
        ├── text-search.ts             # raw /place/textsearch/json
        ├── suggest.ts
        ├── get-place-details.ts
        ├── geocode.ts                 # deny-probe — Rollo's key blocks Geocoding API
        └── probe-apis.ts              # capability discovery across 16 Maps APIs
```

### `adapter/` vs `direct-api/`

Two scripts per call, each with a different purpose:

- **`adapter/`** runs through the `@dashseller/geo` factory. Output is the unified `GeocodingResult` / `Suggestion` / `PlaceDetails` shape — exactly what tRPC procedures and Trigger tasks see. Use to verify the mapper produces the right normalized fields and to compare across providers (the JSON should match shape-wise regardless of upstream).
- **`direct-api/`** calls the upstream API raw (no factory, no mapper). Output is the provider-native shape (`address_components`, `geometry.location.lat` for legacy Google; `addressComponents`, `location.latitude` for Places New; `predictions[]` for Rollo legacy autocomplete). Use to inspect what the provider actually returns and to debug mapper bugs.

Run both for a given call and diff the JSONs to see exactly what the mapper threw away or renamed:

```bash
bun run packages/geo/sandbox/google/direct-api/geocode.ts "1600 Amphitheatre Parkway, Mountain View, CA"
bun run packages/geo/sandbox/google/adapter/geocode.ts "1600 Amphitheatre Parkway, Mountain View, CA"
diff \
  packages/geo/sandbox/google/direct-api/output/geocode-1600_Amphitheatre_Parkway_Mountain_View_CA.json \
  packages/geo/sandbox/google/adapter/output/geocode-1600_Amphitheatre_Parkway_Mountain_View_CA.json
```

## Running

### Google — adapter (normalized) + direct-api (raw)

```bash
bun run packages/geo/sandbox/google/adapter/geocode.ts "1600 Amphitheatre Parkway, Mountain View, CA"
bun run packages/geo/sandbox/google/adapter/suggest.ts "1600 amph" us
bun run packages/geo/sandbox/google/adapter/get-place-details.ts ChIJj61dQgK6j4AR4GeTYWZsKWw

bun run packages/geo/sandbox/google/direct-api/geocode.ts "1600 Amphitheatre Parkway, Mountain View, CA"
bun run packages/geo/sandbox/google/direct-api/suggest.ts "1600 amph" us
bun run packages/geo/sandbox/google/direct-api/get-place-details.ts ChIJj61dQgK6j4AR4GeTYWZsKWw
```

### Rollo — adapter + direct-api

```bash
# Geocode (puzzled-up via Text Search + Place Details)
bun run packages/geo/sandbox/rollo/adapter/geocode.ts "1600 Amphitheatre Parkway, Mountain View, CA"

# Geocode with strict exact-match verification (returns null if components disagree)
bun run packages/geo/sandbox/rollo/adapter/geocode.ts \
  "1600 Amphitheatre Parkway, Mountain View, CA" \
  '{"address1":"1600 Amphitheatre Parkway","city":"Mountain View","state":"CA","zipcode":"94043","country":"US"}'

# Autocomplete
bun run packages/geo/sandbox/rollo/adapter/suggest.ts "520 8th av brooklyn" us
bun run packages/geo/sandbox/rollo/adapter/get-place-details.ts ChIJBdz-ggNbwokRbIEsjVaXrtU

# Raw upstream calls
bun run packages/geo/sandbox/rollo/direct-api/text-search.ts "1600 Amphitheatre Parkway, Mountain View, CA"
bun run packages/geo/sandbox/rollo/direct-api/suggest.ts "520 8th av brooklyn" us
bun run packages/geo/sandbox/rollo/direct-api/get-place-details.ts ChIJBdz-ggNbwokRbIEsjVaXrtU
bun run packages/geo/sandbox/rollo/direct-api/probe-apis.ts          # discovers what Rollo's key authorizes
```

Output JSON files are written to `output/` directories within each folder (gitignored repo-wide via `**/sandbox/**/output/`).
