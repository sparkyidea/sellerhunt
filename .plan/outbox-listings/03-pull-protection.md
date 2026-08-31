# Part 3 — Pull protection in `upsertListings`

## Scope

Mirror the order-side pattern in `pullOrders/upsert.ts`. Stop the listings
pull from overwriting `price` and `quantity` on listings that have an
in-flight outbox row for those fields.

## File

`packages/trigger/src/nodes/pull-listings/upsert.ts`

## Steps in the upsert

1. Build the candidate set of listing IDs from the incoming batch (after the
   reference→id lookup that already happens during upsert).
2. Call `getProtectedEntityIds("listing", listingIds)` — already exists in
   `sync-protection.ts`.
3. In the `ON CONFLICT DO UPDATE` clause, wrap **only the protected fields**
   in `CASE WHEN listing.id = ANY(<protected>) THEN listing.<field> ELSE
   EXCLUDED.<field> END`. Other fields (title, description, item specifics,
   images, etc.) update as today.

### Field-level protection scope

Initial protected fields:

- `price` (start price / current price)
- `currency`
- `availableQuantity`
- `soldQuantity` — **NOT protected**. This is sales data, remote-owned.

Protect only what an outbox row could plausibly have just written. Stretch
this list when new actions land (variants, broader revisions).

### Variant rows

Variants are a separate table (`listing_variant`). This PR doesn't add
protection there because there are no variant-level actions yet. The
existing variant upsert path stays unchanged. Document this explicitly so
future work knows where to extend.

## Snapshot capture (lighter than orders)

`pullOrders/upsert.ts` does a full `captureRemoteEvidence` because shipment
fingerprints require fetching `getFulfillments` separately. For listings,
the data we need to fingerprint (price, quantity) is **already on the
incoming `Listing` object** from `pullListings` — no extra API call needed.

So Part 4 (confirmation) can run inline against `ordersData` / `listingsData`
without an extra adapter call. That's documented there; this part just
records the snapshot on protected outbox rows so the conflict-escalation
cron has visibility:

```ts
// For each in-flight outbox row on a protected listing:
//   remoteSnapshot = { type: "listingState", price, quantity, listingStatus }
```

Lives in a new helper `buildListingRemoteSnapshot` in
`packages/trigger/src/lib/sync-reconciliation.ts`, parallel to
`buildShipmentRemoteSnapshot`.

## Acceptance

- [ ] `getProtectedEntityIds("listing", ids)` is called once per batch.
- [ ] Protected listings keep their local `price`, `currency`,
      `availableQuantity` during the upsert.
- [ ] Non-protected listings update all fields as today.
- [ ] `remoteSnapshot` written for all in-flight rows on protected listings.
- [ ] No N+1 — protection lookup is one batched query for the whole batch.
