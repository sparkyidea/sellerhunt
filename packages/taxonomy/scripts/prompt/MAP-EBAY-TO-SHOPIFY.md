# Map eBay Categories to Shopify Taxonomy

Prompt doc for Claude Code. Paste or reference this to re-run the eBay-to-Shopify category mapping.

## When to re-run

- After pulling new Shopify taxonomy (`bun run packages/taxonomy/scripts/pull-shopify-categories.ts`)
- After pulling new eBay categories (`bun run packages/taxonomy/scripts/pull-ebay-categories.ts`)
- When mapping quality needs improvement for specific verticals

## Model requirement

**Use Sonnet agents only.** This is structured pattern matching, not deep reasoning.

> **WARNING:** If you are running on Opus, STOP. Opus costs ~3x more in time and tokens
> for minimal quality gain on this task. Switch to Sonnet agents by passing `model: "sonnet"`
> to the Agent tool. Do NOT proceed with Opus.

When spawning agents, always use: `"model": "sonnet"`

## Data layout

```
packages/taxonomy/data/
  categories/                          26 Shopify vertical files (canonical taxonomy)
  integrations/
    integrations.json                  registry of marketplaces + versions
    ebay/
      {version}/                       versioned by eBay tree version (e.g. "134")
        categories/                    raw eBay categories (per-category + combined)
        mappings/
          mappings.json              flat lookup consumed by lookupCategory()
          categories/                detailed per-category mapping files
  localizations/
    categories/                        future i18n placeholder
packages/taxonomy/temp/                batch/intermediate files (gitignored)
```

## Prompt

Copy everything below this line and paste into Claude Code:

---

Map all eBay categories to Shopify Product Taxonomy categories. This covers both leaf and non-leaf categories.

**IMPORTANT: Use Sonnet model for all agents.** Do NOT use Opus — it is unnecessarily expensive for this task. If you are currently running on Opus, warn the user about the cost and terminate. All agent spawns must include `model: "sonnet"`.

### Input data

- eBay categories: `packages/taxonomy/data/integrations/ebay/{version}/categories/*.json` (34 vertical files, exclude `categories.json`)
  - Each file: `{ vertical, totalCategories, leaves, categories: [{ id, name, fullName, parentId, level, leaf }] }`
  - Use the latest version directory (highest sort order)

- Shopify taxonomy: `packages/taxonomy/data/categories/*.json` (26 vertical files)
  - Each file: `{ version, categories: [{ id, name, full_name, parent_id, level, children }] }`

### What to map

**Phase A: Leaf categories (~15K) — AI-mapped via agents**
- Map eBay categories where `leaf: true` to Shopify leaf categories (where `children` array is empty)
- Use vertical scoping (see below) to keep context manageable
- Write per-category output files

**Phase B: Non-leaf categories (~2K) — deterministic, no AI needed**
- Map eBay non-leaf categories to the closest Shopify non-leaf category in the matched vertical
- Use the VERTICAL_MAP to resolve which Shopify vertical(s) to search
- Match by name similarity against Shopify non-leaf categories in the vertical
- If multiple Shopify verticals are mapped, pick the one with the best name match
- For catch-all verticals, search all Shopify verticals
- Write these as part of the consolidation step

### Vertical scoping (Phase A)

To keep context manageable, scope the Shopify reference per eBay vertical:

**Narrow verticals** (load only matched Shopify files):
- Baby -> bt (Baby & Toddler)
- Books & Magazines -> me (Media)
- Business & Industrial -> bi (Business & Industrial)
- Cameras & Photo -> co (Cameras & Optics)
- Cell Phones & Accessories -> el (Electronics)
- Clothing, Shoes & Accessories -> aa (Apparel & Accessories)
- Computers/Tablets & Networking -> el (Electronics)
- Consumer Electronics -> el (Electronics)
- Dolls & Bears -> tg (Toys & Games)
- Gift Cards & Coupons -> gc (Gift Cards)
- Health & Beauty -> hb (Health & Beauty)
- Home & Garden -> hg (Home & Garden)
- Jewelry & Watches -> aa (Apparel & Accessories)
- Movies & TV -> me (Media)
- Music -> me (Media)
- Musical Instruments & Gear -> ae (Arts & Entertainment)
- Pet Supplies -> ap (Animals & Pet Supplies)
- Real Estate -> se (Services)
- Specialty Services -> se (Services)
- Sporting Goods -> sg (Sporting Goods)
- Tickets & Experiences -> se (Services)
- Toys & Hobbies -> tg (Toys & Games)
- Travel -> se (Services), lb (Luggage & Bags)
- Video Games & Consoles -> el (Electronics), tg (Toys & Games)

**Catch-all verticals** (load ALL Shopify files — these contain items spanning many verticals):
- Antiques -> all Shopify verticals
- Art -> all Shopify verticals
- Coins & Paper Money -> all Shopify verticals
- Collectibles -> all Shopify verticals
- Crafts -> all Shopify verticals
- Entertainment Memorabilia -> all Shopify verticals
- Everything Else -> all Shopify verticals
- Pottery & Glass -> all Shopify verticals
- Sports Mem, Cards & Fan Shop -> all Shopify verticals
- Stamps -> all Shopify verticals

### Mapping rules

- Match by semantic meaning, not string similarity
- "Antiques > Furniture > Chairs" should map to Furniture, not an antiques category
- Always prefer Shopify leaf categories over parent categories (for leaf mapping)
- If no good match exists, use "na" (Uncategorized) with confidence < 0.5
- Every eBay category (leaf and non-leaf) must have exactly one mapping — no skipping

### Output format (Phase A — per-category files)

For each eBay vertical, write a JSON file to `packages/taxonomy/data/integrations/ebay/{version}/mappings/categories/{slug}.json`:

```json
{
  "ebayCategory": "Baby",
  "shopifyTaxonomyVersion": "2026-05-unstable",
  "totalMapped": 153,
  "highConfidence": 140,
  "lowConfidence": 3,
  "mappings": [
    {
      "ebayId": "100223",
      "ebayFullName": "Baby > Baby Safety & Health > Baby Monitors",
      "shopifyCategoryId": "bt-1-3-1",
      "shopifyFullName": "Baby & Toddler > Baby Health > Baby Health Monitors",
      "confidence": 0.9,
      "mappingSource": "ai"
    }
  ]
}
```

- `confidence`: 0.0-1.0 (1.0 = exact match, 0.7+ = good match, < 0.5 = weak/no match)
- `mappingSource`: "ai" for all AI-mapped entries. Use "unmapped" only if you cannot determine a mapping at all.

### Consolidation (after all verticals complete)

Write a flat lookup file to `packages/taxonomy/data/integrations/ebay/{version}/mappings/mappings.json`:

```json
{
  "100223": "bt-1-3-1",
  "9355": "el-2-1",
  "2984": "bt",
  ...
}
```

This file includes:
1. All leaf mappings from Phase A (where `mappingSource` is "ai", exclude "unmapped")
2. All non-leaf mappings from Phase B

This file is consumed by `lookupCategory("ebay", "100223")` at runtime.

### Non-leaf mapping logic (Phase B)

For each eBay non-leaf category:
1. Resolve its top-level vertical (walk up parentId chain)
2. Look up which Shopify vertical(s) are mapped via the VERTICAL_MAP
3. Among Shopify non-leaf categories in those verticals, find the best name match:
   - Exact name match (case-insensitive) -> use it
   - If the eBay category name appears as a segment in a Shopify full_name -> use that
   - Otherwise, map to the Shopify vertical's root category (the top-level non-leaf)
4. For catch-all verticals, search all Shopify verticals for the best match

Write this as a script: `packages/taxonomy/scripts/map-ebay-nonleaf.ts`

### Validation

After writing each mapping file:
1. Verify every `shopifyCategoryId` exists in the Shopify data files
2. Verify every eBay leaf from the input appears in the output
3. Report: total mapped, high confidence (>= 0.7), low confidence (< 0.5), unmapped count

### Execution approach

Process verticals from smallest to largest. Use parallel Sonnet agents. For large verticals (1000+ leaves like Collectibles, Business & Industrial, Home & Garden, Sporting Goods), batch into groups of ~200 leaves per agent call.

**Temp files:** Write any batch files, intermediate results, or working data to `packages/taxonomy/temp/`. This directory is gitignored. Do NOT write temp files to `data/` or the project root.

### Resume

If mapping files already exist in `data/integrations/ebay/{version}/mappings/categories/`, skip those verticals. To re-map a specific vertical, delete its file first.
