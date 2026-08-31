# @dashseller/taxonomy

Canonical product category system based on [Shopify's Product Taxonomy](https://github.com/Shopify/product-taxonomy). Provides lookup functions for category resolution during marketplace sync.

## Data structure

```
data/
  categories/                              Canonical taxonomy (Shopify-sourced, 26 verticals)
  integrations/
    integrations.json                      Registry of marketplaces + versions
    ebay/
      {version}/                           Versioned by eBay tree version (e.g. "134")
        categories/                        Raw eBay categories (per-category + combined)
        mappings/
          mappings.json                  Flat lookup consumed by lookupCategory()
          categories/                    Detailed per-category mapping files
  localizations/
    categories/                            Future i18n (placeholder)
```

All files under `data/` are committed to git. They are pulled once from upstream sources and only re-pulled when the upstream taxonomy updates.

## API

```typescript
import {
  lookupCategory,
  getCategory,
  getCategoryTree,
  getTaxonomyVersion,
} from "@dashseller/taxonomy";

// Resolve a marketplace category to canonical ID
const categoryId = lookupCategory("ebay", "9355"); // "el-2-1" or null

// Get category details
const info = getCategory("el-2-1");
// { id: "el-2-1", name: "Cell Phones", fullName: "Electronics > ...", level: 2, leaf: true, parentId: "el-2" }

// Get full tree for UI rendering
const tree = getCategoryTree(); // CategoryNode[] (26 top-level verticals)

// Check data version
const version = getTaxonomyVersion();
// { version: "2026-05-unstable", categoryCount: 12378 }
```

All functions are pure and read from static JSON files. No database queries. Data is lazy-loaded on first call and cached in memory.

## What gets stripped

The full Shopify taxonomy is 262MB+. We keep only what's needed for category resolution:

| Field | Kept | Why |
|-------|------|-----|
| `id` | Yes | Primary key (e.g., "aa-1-1") |
| `name` | Yes | Display name |
| `full_name` | Yes | Breadcrumb path |
| `parent_id` | Yes | Hierarchy |
| `level` | Yes | Depth in tree |
| `children` | Yes | Tree structure |
| `attributes` | No | Deferred (category-specific item specifics) |
| `return_reasons` | No | Not needed |
| `ancestors` | No | Derivable from parent_id |

GID prefixes (`gid://shopify/TaxonomyCategory/`) are stripped from all IDs.

Non-English locales (30 languages, ~5GB) are excluded. English only for now.
