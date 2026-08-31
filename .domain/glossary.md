# Glossary

**This file disambiguates. It does not define.** One line per term, then a
pointer to where the depth lives. If you're about to write a second paragraph
here, it belongs in that domain's `rules.md` or `concepts.md` instead.

Terms live here only when the confusion is **between** bounded contexts. A term
that only ever means one thing inside one domain belongs in that domain, not
here.

---

## The pairs people collapse

These four distinctions cause more wrong code in this repo than anything else.

| Not this | …and not this | The difference |
| --- | --- | --- |
| **Product variant** | **Listing variant** | Catalog vs channel. The variant *we* hold stock for, vs the option *a marketplace* sells. Joined by `listingVariant.productVariantId` — see [LST-001](listings/rules.md). |
| **Shipment** | **Fulfillment** | A physical package, vs *the marketplace's view* of that package. Conflating them is what produced the fingerprint workaround — see [ADR 0003](decisions/0003-explicit-fulfillment-correlation.md). |
| **Marketplace** | **Channel** | The platform as a type (eBay), vs one seller's connection to it in one country. Two eBay accounts = one marketplace, two channels. |
| **Tracking source** | **Carrier** | Which adapter served the data (`tracking.provider`), vs who moves the box (`shipment.carrier`) — see [`fulfillment/carriers.md`](fulfillment/carriers.md). |
| **Shopify "Product"** | **our `product`** | Shopify's Product is shop-scoped, so it maps to our **`listing`**. Our `product` has no marketplace counterpart. Full dictionary: [`channels/terminology.md`](channels/terminology.md), rule [CHN-007](channels/rules.md). |

---

## Catalog — channel-agnostic, our own truth

**Product** — one record per *thing you sell*. Belongs to no marketplace.

**Product variant** — a sellable configuration (size, colour, SKU). Carries the
physical facts shipping needs: weight, dimensions.

**Stock** — quantity of one variant at one warehouse. → [INV-002](inventory/rules.md), [INV-006](inventory/rules.md)

**Warehouse** — a physical stock location. → [INV-005](inventory/rules.md)

**Category** — canonical taxonomy node. → [`catalog/category.md`](catalog/category.md)

---

## Channel — marketplace-scoped

**Marketplace** — the platform as a type: eBay, Shopify, Amazon.

**Channel** — one seller's connection to one marketplace, in one country. The
unit of OAuth, sync state, and webhook subscription.

**Listing** — a product as it appears on one channel.

**Listing variant** — one purchasable option within a listing. The channel↔catalog
join. → [LST-001](listings/rules.md)

---

## Orders

**Order** — a purchase on one channel.

**Order line** — one line item, carrying both channel and catalog identity.
→ [ORD-001](orders/rules.md)

**Parent order** — synthetic order grouping children shipped as one box.
→ [FUL-001](fulfillment/rules.md)

**Order event** — audit/comment trail on an order.

---

## Fulfillment

**Shipment** — a physical package. → [`fulfillment/concepts.md`](fulfillment/concepts.md)

**Fulfillment** — the marketplace's view of a shipment.

**Correlation** — the recorded link between the two. Explicit, never inferred.
→ [FUL-005](fulfillment/rules.md)

**Tracking / tracking event** — carrier-issued number and its scan history.
→ [FUL-009](fulfillment/rules.md), [FUL-010](fulfillment/rules.md)

---

## Sync

**Pull** — fetching marketplace state into our DB.

**Push** — propagating our state to a marketplace. Always via the outbox.
→ [SYN-001](sync/rules.md)

**Sync outbox** — the durable record of every local mutation awaiting
propagation. → [`sync/outbox.md`](sync/outbox.md)

**Pull protection** — the pull side declining to overwrite fields a pending push
owns. → [SYN-003](sync/rules.md)

**Confirmation** — a later pull observing the state we intended. Not the same as
the push returning 2xx. → [SYN-002](sync/rules.md)

**Seed / baseline** — the initial observation of marketplace stock at connect,
and the rule classifying orders against it. → [INV-002](inventory/rules.md), [INV-003](inventory/rules.md), [INV-007](inventory/rules.md)

---

## Tenancy

**Organization** — the tenant. Every business table is scoped by it.
→ [TEN-001](tenancy/rules.md)

**User** — a person. `createdByUserId` is attribution only, never isolation.
