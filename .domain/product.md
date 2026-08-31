# Product

What dashseller does for the seller. Written from the seller's side of the
screen — mechanics live in [`sync/outbox.md`](sync/outbox.md).

## What it is

A **multi-marketplace seller management platform**. Sellers manage listings,
inventory, orders, and shipments across several marketplace channels from one
place.

eBay is live. Shopify has a working adapter and webhook path, not yet wired into
every UI flow. **Amazon is not implemented** — `"amazon"` appears in the
`MarketplaceType` union and nowhere else; there is no adapter directory.

## The four jobs

1. **Sync** — pull listings, orders, and stock from each connected channel.
2. **Reconcile** — merge channel state with our local source of truth, without
   double-counting inventory or stomping local edits.
3. **Surface** — unified views across channels: dashboard, listings, orders,
   shipments, issues.
4. **Notify** — surface what needs the seller's attention.

## What makes it hard

The whole product is a two-way sync against systems that don't agree with each
other, don't agree with us, and occasionally don't agree with themselves.
Three constraints fall out of that and shape most decisions:

- **Writes are eventually consistent.** Nothing goes straight to a marketplace;
  every write is an outbox row that may not confirm for minutes.
  [ADR 0002](decisions/0002-outbox-for-marketplace-writes.md)
- **The seller can act outside dashseller.** Shipping in eBay Seller Hub is
  normal, not an error case. Out-of-band state must import cleanly.
- **Inventory errors are asymmetric.** Underselling is a lost sale. Overselling
  is a cancelled order, a defect rate hit, and possibly a suspended account.
  When a rule can only be biased one way, bias it toward undersell.
  [ADR 0004](decisions/0004-clean-break-initial-sync.md)

## Pages in this folder

Seller-facing flows: what the user does, step by step, and the business rules
that govern it. Add one per major flow (connect a channel, ship an order, edit a
listing, resolve an issue) as they stabilize.

> Mostly unwritten. Write a page here when a flow's rules stop changing weekly —
> a flow documented mid-churn is a flow documented wrong.
