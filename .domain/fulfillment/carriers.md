# Carriers / tracking sources

**The tracking source is not the shipping carrier.** `tracking.provider` is
which adapter served the data; `shipment.carrier` is who moves the box. Keep
them distinct — one shipment's carrier never changes, its tracking source might.

`packages/shipment-tracking/`

## Current source

**Ship24**, via the Package Tracker mobile endpoint
(`api.ship24.com/public/v1/trackers/track`), provider slug `package-tracker`.
Ship24 **auto-detects the courier**, so `TrackingInput.carrierHint` is ignored.

## Why not direct carrier APIs

**USPS's direct API only tracks labels under your own MID.** Marketplace and
third-party tracking numbers return 403. Getting access to arbitrary numbers
requires a signed IP Agreement with USPS — a business process, not an API key.
Since most tracking numbers we see are marketplace-generated, direct USPS was a
dead end and an aggregator is the practical answer.

Direct UPS / DHL / FedEx / Shippo integrations would each get their own provider
slug if added. None are built.

## Ingestion

Polling, not webhooks. Events upsert on `(tracking_id, reference)` with
`ON CONFLICT DO NOTHING`, where `reference` is a **deterministic hash** — so
re-polls of already-seen events are no-ops rather than duplicate rows.

Geo resolution runs on the **write** path: `latitude`/`longitude` are persisted
onto `tracking_event` at ingest (zip → city+state → state centroid, DB-only),
never resolved per read. `location` keeps the raw upstream string verbatim
("ESCONDIDO, CA 92026") so the resolver has something to work from, and is null
for synthesized in-transit events.
