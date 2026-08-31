# Part 1 — Actions, payloads, and fingerprints

## Action constants

Two new `action` values for `entityType: 'listing'`:

| action | What it does | eBay API used |
|---|---|---|
| `updateListingPrice` | Change the listing's start/buy-it-now price | `ReviseInventoryStatus` |
| `updateListingQuantity` | Change the listing's available quantity | `ReviseInventoryStatus` |

Single new file: `packages/sync/src/actions.ts` (or co-located with existing
outbox helpers if `packages/sync` doesn't materialise this PR — overview can
host the constants in `packages/trigger/src/lib/sync-actions.ts`).

```ts
export const LISTING_ACTIONS = {
  updatePrice: "updateListingPrice",
  updateQuantity: "updateListingQuantity",
} as const;
export type ListingAction =
  (typeof LISTING_ACTIONS)[keyof typeof LISTING_ACTIONS];
```

## Payload shapes

Stored in `sync_outbox.payload` (jsonb). Discriminated by `action`:

```ts
type UpdatePricePayload = {
  // Always store as the smallest currency unit (cents) to match the rest
  // of the schema; the adapter converts at the boundary.
  priceMinor: number;
  currency: string;       // ISO-4217, e.g. "USD"
};

type UpdateQuantityPayload = {
  quantity: number;       // available count (NOT delta)
};
```

Why absolute values, not deltas: idempotency. Replaying a `set quantity to
17` action twice still leaves the listing at 17. Replaying a `+5` delta does
not. The push task and the fingerprint both rely on absolute targets.

## Fingerprint formulas

Reuse `createHash("sha256")` style from
`packages/trigger/src/lib/sync-reconciliation.ts`. New helpers in the same
file:

```ts
export function computeListingPriceFingerprint(input: {
  listingId: string;
  priceMinor: number;
  currency: string;
}): string;

export function computeListingQuantityFingerprint(input: {
  listingId: string;
  quantity: number;
}): string;
```

Both serialize a sorted-key JSON of the inputs and hash it. The listingId is
included so two outbox rows for different listings never share a fingerprint
even when the target value coincides.

## Confirmation predicate

Unlike shipments (where we fingerprint a remote fulfillment), price and
quantity confirmation is a **direct equality check** against the pulled
listing's current value. The fingerprint guards against replays and
cross-row matching, but the comparison itself is just:

```ts
function listingMatchesOutbox(
  listing: Listing,
  outbox: SyncOutbox
): boolean {
  if (outbox.action === "updateListingPrice") {
    const p = outbox.payload as UpdatePricePayload;
    return listing.priceMinor === p.priceMinor && listing.currency === p.currency;
  }
  if (outbox.action === "updateListingQuantity") {
    const p = outbox.payload as UpdateQuantityPayload;
    return listing.availableQuantity === p.quantity;
  }
  return false;
}
```

Lives in `packages/trigger/src/lib/sync-reconciliation.ts` next to the
shipment matcher, so Part 4 can call it.

## Acceptance

- [ ] `LISTING_ACTIONS` constants exported and used in tRPC + push task.
- [ ] Payload types compile against `syncOutbox.payload` (jsonb is unknown,
      narrow at the boundary).
- [ ] Fingerprint helpers are pure, unit-tested with stable output for the
      same input across re-runs.
- [ ] `listingMatchesOutbox` returns true only when the action's target
      matches the listing's current state.
