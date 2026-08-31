# Sellbrite — Product / Listing / Order Model

How Sellbrite structures its three core entities and the relationships between them. Based on live UI investigation of the Sellbrite app (April 2026), using a seller account with eBay and Amazon channels connected.

---

## The three entities

### Product (catalog master)

One record per *thing you sell*. Channel-agnostic. Lives in Sellbrite's own catalog.

**Tabs on the Product edit page:**

| Tab | Purpose |
|---|---|
| Product Info | Identity + metadata (see below) |
| Description | Rich-text product description |
| Images | Canonical product images |
| Inventory | Stock levels across warehouses |
| Variations | Child Product Variations (size/color/etc.) |
| Custom Attributes | Channel-required specifics (e.g. "Filament Diameter", "Compatible Model") |
| Listings | Every listing of this product across channels |
| Orders | Every order that included this product |

**Product Info fields:**

```
Name
Identifiers:  SKU, ASIN, UPC, GTIN, EAN, EPID, GCID, ISBN  (all of them at once)
Classification: Category, Condition, Condition Note
Branding:  Brand, Manufacturer, Model Number
Pricing:  MSRP, Price              ← both present; MSRP is list price
Physical:  Package Weight, Package Dimensions
Misc:  Store Product URL, Tags, Notes
```

**Sidebar rollups** (read-only, aggregated across channels):
- Inventory: Available / Reserved / On Hand
- Sales: # Sold / $ Sold
- Price history: Low / Average / High sold price
- Created / Last Modified timestamps

### Listing (channel publication)

A listing is a **channel-shaped offer**. The tab set is different per channel because each marketplace needs different data.

**eBay listing tabs:**

```
Product Identifiers · Title & Description · Images · Variations ·
Category & Format · Shipping · Payments & Returns
```

eBay listings own full content because eBay has no central catalog — every listing supplies everything. Fields include eBay-specific concerns like Subtitle, Auction format, Duration, Item Specifics (Required + Recommended + Additional), shipping services per zone, return policies.

**Amazon listing tabs:**

```
Product Identifiers · Offer · Pricing
```

Only 3 tabs — **no** title, description, images, or category. Amazon's catalog is keyed by ASIN; the listing is just *offer terms*: condition, quantity, handling time, fulfillment channel (FBA/FBM), tax code, launch date, restock date, gift-wrap eligibility. Pricing owns price, MSRP, sale price, MAP, sale start/end dates.

**Listing actions (bottom of form):**
- `Save & Publish` — push to marketplace
- `End` — terminate listing
- `Delete` — remove from Sellbrite
- `Sync From eBay` — explicit pull (not silent)

### Order

Orders come in from marketplaces keyed by channel + marketplace order ID. Order line items reference a **Product** (via SKU resolution), not a Listing directly.

---

## Relationships

```
PRODUCT
  │
  ├──< PRODUCT_VARIATION          (catalog children — size/color)
  │       │
  │       ├──< INVENTORY          (qty per warehouse, belongs to variation)
  │       │
  │       └──< LISTING_VARIATION  (many per variation — one per channel listed)
  │
  ├──< LISTING                    (channel publications — many per product)
  │       │
  │       ├──< LISTING_VARIATION  (one per product variation exposed)
  │       │
  │       └── TEMPLATES           (Title / Pricing / Category / Shipping / Offer
  │                                templates reference product attributes)
  │
  └──< ORDER_LINE_ITEM            (orders resolve to product via SKU)
          │
          └── ORDER (marketplace-origin)
```

---

## Linking mechanism: SKU

**Everything links by SKU.** Product has a SKU; Variations have SKUs; Listings map to Products by matching SKU; Listing Variations map to Product Variations by matching SKU; incoming order line items resolve to Products by SKU lookup.

### Consequences

- During eBay import, Sellbrite matches incoming listings to existing Products by SKU. No SKU match → creates a new Product.
- Editing a SKU on a Product means the old SKU is still referenced by listings/orders until manually relinked.
- **Design flaw:** SKU is used as both business data and identity key. Sellers can't safely rename a SKU; the workaround is delete + recreate.

---

## Templates — the override mechanism

Sellbrite does not store duplicate catalog content on listings. Instead, every listing section has a **Template** selector:

- Title Template (e.g. `{{product.name}} - {{variation.color}} {{variation.size}}`)
- Pricing Template
- Category Template
- Shipping Template
- Offer Template (Amazon)

When a listing is created, the template is applied: placeholders resolve against the Product's fields, producing the listing's title/pricing/category. The listing then stores the resolved values, and the seller can override individual fields manually.

**Net effect:** the Product is the single source of truth for catalog data. Listings are generated *from* the Product via templates. Bulk updates flow by re-applying templates.

---

## Sync behavior

**Explicit, not silent.** Every listing page has a `Sync From eBay` / `Sync From Amazon` button. Sellbrite does not silently overwrite Sellbrite-side catalog data with marketplace pulls. The seller decides when to reconcile.

`Save & Publish` is the other direction — push the Sellbrite-side listing state to the marketplace.

---

## Product ↔ Listings view

On a Product's **Listings tab**, Sellbrite shows a cross-channel table:

| Column | Content |
|---|---|
| Channel | Marketplace name (eBay, Amazon, Walmart...) |
| Qty | Per-variation quantity exposed to that channel |
| Price | Current listing price |
| Last Modified | Last time the listing was updated |
| Status | Active / Not Listed |

For channels where the product isn't yet listed, a "+ Create Listing" link starts the listing creation flow, with the listing form prefilled from the Product via the channel's default templates.

---

## Product ↔ Orders view

On a Product's **Orders tab**, Sellbrite shows every order that included this product across any channel. Orders remain attached to Products (via SKU resolution), not to Listings — so if a listing is deleted, the order history persists on the Product.

---

## Field ownership summary

| Concern | Product owns | Listing owns |
|---|---|---|
| Name / Title | ✓ (canonical) | Template-rendered value, override-able |
| Description | ✓ (canonical) | Template-rendered, override-able |
| Images | ✓ (canonical) | Can override per-channel |
| SKU, UPC, EAN, GTIN, ISBN, ASIN, EPID, GCID | ✓ | — |
| Category (Sellbrite) | ✓ | — |
| Category (marketplace) | — | ✓ (via template) |
| Condition | ✓ | Inherits; listing can show condition description (eBay) |
| Brand, Manufacturer, Model | ✓ | — |
| MSRP | ✓ | — |
| Price (list) | ✓ | ✓ (listing override) |
| Sale Price, MAP | — | ✓ (channel-specific) |
| Weight, Dimensions | ✓ | — |
| Quantity | — (per-variation) | ✓ (per-channel exposed qty) |
| Item Specifics (eBay) | via Custom Attributes | ✓ (resolved at publish) |
| Shipping policy | — | ✓ (per-channel) |
| Return policy | — | ✓ (per-channel) |
| Listing format (auction/fixed) | — | ✓ (eBay-only) |
| Duration | — | ✓ (eBay-only) |
| Handling time, FBA/FBM | — | ✓ (Amazon offer terms) |
| Watch/view counts | — | ✓ (marketplace metric) |

---

## Key lessons for dashseller

1. **Catalog vs Channel separation is non-negotiable.** Product owns identity + physical attributes; Listing owns channel-specific offer terms.
2. **Listing shape is per-channel, not universal.** Don't force eBay columns onto Amazon listings. JSON-per-adapter or side-table-per-adapter.
3. **Templates (or overrides) for content.** Catalog content lives on Product; Listing references or overrides it. Avoid duplicating title/description/images as independent columns.
4. **Explicit sync, not silent.** Users should control when marketplace state reconciles with catalog state.
5. **Orders attach to Product, not Listing.** A deleted listing shouldn't orphan its order history.
6. **SKU-as-identity is a flaw to avoid.** Use internal UUIDs for FKs; let SKU be a mutable attribute.

---

## Sources

- Sellbrite app (`app.sellbrite.com`) — live investigation, April 2026
- [Sellbrite glossary of terms](https://support.sellbrite.com/en/articles/3367159-sellbrite-glossary-of-terms)
- [Bulk listing management](https://www.sellbrite.com/update-product-information/)
- [Step 3: Build your Product Catalog](https://support.sellbrite.com/en/articles/3367173-step-3-build-your-product-catalog)
- [Editing eBay / Shopify / Walmart listings](https://support.sellbrite.com/en/collections/1951389-how-to-s)
