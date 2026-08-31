# 0003 — Fulfillment correlation is recorded explicitly, never inferred

- **Status:** Accepted
- **Date:** 2026-05-22

## Context

The `shipment` table was doing three jobs at once: the local act of shipping,
the remote fulfillment record, and the sync relationship between them.

`computeShipmentFingerprint` existed to paper over that conflation. With no
first-class way to correlate "what we pushed" against "what the marketplace now
shows", it hashed row content as a stand-in identity. Content hashes are a bad
identity — any benign field change breaks the match, and two genuinely distinct
shipments with identical content collide.

Three facts made the fix obvious:

1. **Tracking number is the natural correlation key.** Carriers issue them, and
   the marketplace itself enforces uniqueness within a channel's order context.
2. **The schema already anticipated richer identity** — `provider`,
   `providerTransactionId`, `labelStatus`, `labelUrl` were already sitting there
   for the label-purchase flow.
3. **Merged shipments need their own model.** One box covering N orders for the
   same buyer is cleanest as a synthetic *parent order* the children reference,
   so the invariant `1 tracking = 1 shipment = 1 local order` holds.

## Decision

> A shipment record describes a physical package. A fulfillment is the remote
> view of that package. Correlation between them is recorded explicitly, not
> inferred.

Three additive columns, no new tables, two distinct axes:

| Column                        | Axis                    | Meaning                                        |
| ----------------------------- | ----------------------- | ---------------------------------------------- |
| `shipment.source`             | provenance of the row   | `local` \| `marketplace`                        |
| `sync_outbox.correlationMethod` | per-push audit        | how *this push* matched its remote counterpart |
| `order.parentOrderId`         | merge grouping          | nullable self-FK; non-null = part of a merge   |

**Correlation is a per-push event, so its method lives on `sync_outbox`, not
`shipment`.** A merged shipment fans out to N outbox rows, each of which can
correlate by a different method — child A via `remote_id` from a clean response,
child B via `client_reference` echo after a lost response, child C via
`tracking_match` at reconciliation. Storing the method on `shipment` would
flatten that away. It also sits next to `external_ref` (the *what*) where the
*how* belongs.

**Priority ladder**, tried in order:

1. `remote_id` — push response returned the fulfillment ID. Strongest.
2. `client_reference` — we sent `outbox.id`, marketplace echoed it. Needs no
   tracking. Shopify supports it; eBay does not.
3. `tracking_match` — both sides have tracking, normalized equal, same
   `(channel, order)` scope after parent resolution.
4. `manual_link` — user resolved the ambiguity.
5. No link — outbox stays in a needs-review state.

Unmatched remote fulfillments seen by pull-orders become
`shipment.source = 'marketplace'` imports. No outbox row, no correlation method
— the source column *is* the audit.

## Alternatives rejected

- **Keep the content fingerprint.** Brittle in both directions: false negatives
  on benign edits, false positives on identical content.
- **A `shipment.remoteSnapshot` jsonb column.** Every durable audit trail lives
  on the outbox row (the per-push event), never on the shipment row (the
  per-package fact). One source of truth per axis.
- **A `marketplace_import` value for `correlationMethod`.** Already encoded by
  `shipment.source`. One axis per column.
- **A separate `marketplace_fulfillments` table.** Redundant with the outbox.
- **Auto-detecting merges from marketplace pulls.** Merges are user-initiated in
  dashseller only. `pull-orders` never infers "these two orders share a tracking
  so they must be merged."

## Consequences

- `sync_outbox.fingerprint` and both `computeShipmentFingerprint` helpers are
  deleted. Do not reintroduce content hashing as identity.
- Correlation adoption is queryable per channel × method per week — that's how
  we find adapters silently falling back down the ladder.
- `shipment.reference` is kept for display/backwards-compat only. The source of
  truth for per-marketplace-order fulfillment IDs is the outbox row's
  `external_ref`.
- Merged-shipment correlation requires resolving to the merge root
  (`order.parentOrderId ?? order.id`) *before* comparing. Any new correlation
  code that skips this will mismatch every merged shipment.
