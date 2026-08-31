# Marketplace terminology → our model

Every adapter's job is a translation. This is the dictionary.

Marketplaces reuse each other's words for different things, so **a marketplace's
term never tells you which of our entities it maps to.** Check this table, not
the name. See [CHN-007](rules.md).

Source of truth for anything here: the mappers in
`packages/marketplace/src/adapters/<vendor>/api/mapper/`. Where this page and a
mapper disagree, the mapper wins and this page is a bug.

---

## The false friends

The three that will silently corrupt data if you trust the name:

| Their word | Looks like our… | Actually maps to our… |
| --- | --- | --- |
| Shopify **Product** | `product` | **`listing`** — it's scoped to one shop, so it is channel data |
| Shopify **ProductVariant** | `product_variant` | **`listing_variant`** |
| eBay **Item** | *(no collision)* | **`listing`** |

Shopify's Product is the dangerous one. It is a *listing in one shop*, not a
channel-agnostic catalog entry. Mapping it to `product` puts channel data in the
catalog and breaks the cross-channel spine that `product` exists to be.

---

## Entity mapping

| Our model | eBay | Shopify | Notes |
| --- | --- | --- | --- |
| `listing` | `Item` (`GetItem`) | `Product` | Channel-scoped presentation of a thing for sale |
| `listing_variant` | `Variation` | `ProductVariant` | The purchasable option |
| `product` | **none** | **none** | See below — no marketplace has this concept |
| `product_variant` | **none** | **none** | Derived with its product |
| `order` | `Order` | `Order` | Genuinely the same idea |
| `order_line` | `lineItem` | `LineItem` | |
| `shipment` / fulfillment | `Fulfillment` | `Fulfillment` | Remote side only; our `shipment` is the physical package — see [`../fulfillment/concepts.md`](../fulfillment/concepts.md) |
| `channel` | a seller account + site | a shop | One OAuth grant |
| `marketplace_category` | category id (site-scoped) | `category` | → canonical `category`, see [`../catalog/category.md`](../catalog/category.md) |
| `stock` | derived, see below | `InventoryLevel` / `inventoryItem` | The biggest structural divergence |

### `product` has no marketplace counterpart

**No adapter produces a neutral `Product`.** The type exists in
`packages/marketplace/src/types.ts`, but nothing maps into it — grep it and
you'll find no producer.

Products are created *locally*, 1:1 from each imported listing
(`createProductsForNewListings` in `packages/sync/src/listings/upsert-listings.ts`).
That is deliberate: `product` is our invention, the channel-agnostic spine that
lets one physical thing be listed on several channels. No marketplace has it,
because no marketplace has a concept of "the same item, elsewhere".

The 1:1 auto-creation is also why the catalog fills with near-duplicates, and why
merge suggestions are an open problem rather than a nice-to-have.

---

## Identifiers and references

Each side's identity scheme, and what we store in `reference`.

| | eBay | Shopify |
| --- | --- | --- |
| Listing id | `ItemID` / `legacyItemId` — numeric string | `gid://shopify/Product/123`, stored **stripped** via `stripGid` |
| Variant id | **none** — eBay variations have no stable id | `gid://shopify/ProductVariant/456`, stable |
| Order id | `orderId` | `gid://shopify/Order/…`, stripped |
| Order line id | `lineItemId` | `LineItem` gid, stripped |

**`listing_variant.reference` is synthesized differently per adapter, for a
reason.** eBay variations have no stable id, so the reference encodes the
attribute pairs: `406334297966-Color-Black-Size-L`, keys sorted alphabetically
for stability. Shopify variants *do* have stable ids, so the reference prefers
the seller's SKU (survives product recreation, and merchants recognize it) and
falls back to a short sha1 of `productId::variantId`.

Consequence: **an eBay variant reference changes if the seller renames an
attribute value.** A Shopify SKU-based reference collides if a shop reuses SKUs
across products — a known caveat in [`shopify.md`](shopify.md).

Always store GIDs stripped. A raw `gid://` in the database is a bug — see
[CHN-004](rules.md) for the same principle applied to topic enums.

---

## Where the models genuinely diverge

These are not naming differences. Do not paper over them in an adapter.

**Inventory.** eBay gives you `Quantity` and `QuantitySold` on the variation and
you *derive* available as `max(0, Quantity − QuantitySold)`. Shopify gives you a
real inventory model: `inventoryItem` with per-location `InventoryLevel`, plus
`inventoryQuantity` on the variant and `totalInventory` on the product. eBay has
no location concept at all.

Our `stock` is per `(variant, warehouse)`. The eBay adapter therefore collapses
to the org's default warehouse; the Shopify adapter has real locations it could
map but currently does not. See [`../inventory/rules.md`](../inventory/rules.md)
for what the seeded quantity means.

**Correlation echo.** Shopify round-trips a client reference, so a push can
correlate without tracking. eBay does not, so it falls to `tracking_match`. This
is why the ladder in [FUL-005](../fulfillment/rules.md) has rungs some adapters
can never reach.

**Observation clock.** eBay's `GetItem` returns a response `Timestamp` — an
exact provider clock. Shopify has no equivalent on listings, so seeding falls
back to bracketing app clocks. See [INV-003](../inventory/rules.md).

---

## Amazon

**Not implemented.** `"amazon"` appears in the `MarketplaceType` union in
`packages/marketplace/src/types.ts` and nowhere else — there is no
`adapters/amazon/` directory, no stub, no mapper.

When it is built, expect a third naming scheme (`ASIN` for the catalog item,
`SKU`/*listing* for the seller's offer, `Order`/`OrderItem`) and a genuinely
different shape: Amazon separates the shared catalog entry from the seller's
offer, which is closer to our `product` / `listing` split than either eBay or
Shopify. Add its column here before writing the mapper.

---

## Writing a new adapter

1. Fill in this table's column first. If you can't, you don't understand the API
   yet.
2. Map into the neutral types in `packages/marketplace/src/types.ts`. Never let
   a vendor type past the mapper — [CHN-004](rules.md).
3. Decide the `reference` scheme for listings, variants, orders, and lines.
   Stability across re-pulls is the requirement, not readability.
4. Record what the vendor *cannot* do — no client-reference echo, no observation
   clock, no locations — in that adapter's page. Those gaps propagate into rules.
