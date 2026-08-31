# Fulfillment model

## The core distinction

> A **shipment** describes a physical package.
> A **fulfillment** is the marketplace's view of that package.
> The link between them is **recorded**, never inferred.

Conflating these three is what produced the content-fingerprint workaround that
[ADR 0003](../decisions/0003-explicit-fulfillment-correlation.md) removed. Keep
them separate.

## Entities

```
order ──┬── orderLine ──┬── listingVariant   (what was bought on the channel)
        │               └── productVariant   (what it is in our catalog)
        │
        ├── parentOrderId ──► order          (self-FK; non-null = merged group)
        │
        └── shipment ──┬── shipmentLine ──► orderLine
                       ├── warehouse
                       ├── packagePreset
                       └── tracking ──► trackingEvent
```

## Invariants

- **`1 tracking = 1 shipment = 1 local order`.** This is why merged shipments
  need a synthetic parent order rather than a many-to-many. Preserve it.
- **Correlation resolves to the merge root first.** Compare
  `order.parentOrderId ?? order.id`, never the raw `orderId`. Skipping this
  mismatches every merged shipment.
- **Tracking comparison is normalized** — trimmed, uppercased, non-empty on both
  sides. An empty tracking never matches an empty tracking.
- **`shipment.source` is the provenance axis; `sync_outbox.correlationMethod` is
  the per-push audit axis.** One axis per column. A marketplace-sourced shipment
  has no outbox row and no correlation method — its `source` *is* the record.
- **`shipment.reference` is display-only.** The source of truth for
  per-marketplace-order fulfillment IDs is the outbox row's `external_ref`.

## Merged shipments

One box, N orders, same buyer. The children point at a synthetic parent order.
Each child still gets its own outbox row, and **each can correlate by a
different method** — that's precisely why the method lives on the outbox row.

Merges are **user-initiated in dashseller only**. `pull-orders` never infers a
merge from two orders sharing a tracking number.

## Out-of-band shipments

A seller who ships directly in eBay Seller Hub produces a remote fulfillment
with no local push. `pull-orders` materializes it as a shipment row with
`source = 'marketplace'`. No outbox row, no correlation. Expect these; they are
normal.

## Tracking

Carrier scans arrive by poller (Pitney Bowes in production) and are upserted
with `ON CONFLICT (tracking_id, reference) DO NOTHING`, so re-polls are
idempotent. Geo resolution happens on the **write** path — `latitude`/`longitude`
are persisted on `tracking_event` at ingest, not resolved per read.

The user-facing journey is bracketed:

```
[ Dispatched from warehouse ] → [ carrier scans ] → [ Delivered to ship-to ]
        ↑ our data                 ↑ carrier            ↑ our data
```

Both anchors come from `shipment.shipFrom*` / `shipment.shipTo*`, never the
carrier. The carrier's own "Delivered" scan is dropped as a duplicate of the
ship-to anchor. The first carrier scan usually reports the warehouse city and is
left alone — the anchor sits before it.
