# Map eBay Categories to Shopify Taxonomy (v2)

Prompt doc for running the token-efficient eBay-to-Shopify category mapping script.

For design rationale, see [MAPPING-V2-DESIGN.md](./MAPPING-V2-DESIGN.md).

## Prerequisites

1. eBay categories pulled: `bun run packages/taxonomy/scripts/pull-ebay-categories.ts`
2. Shopify categories pulled: `bun run packages/taxonomy/scripts/pull-shopify-categories.ts`
3. `OPENAI_API_KEY` set in `packages/taxonomy/scripts/.env`

## When to re-run

- After pulling new Shopify taxonomy or eBay categories
- When mapping quality needs improvement for specific verticals
- When the `--max-targets` parameter needs tuning

## Data layout

```
packages/taxonomy/data/
  categories/                          26 Shopify vertical files
  integrations/
    ebay/
      {version}/                       e.g., "134"
        categories/                    34 eBay vertical files + categories.json
        mappings/
          mappings.json              flat lookup (ebayId → shopifyCategoryId)
          categories/                  per-vertical mapping detail files
```

## Quick start

### Map everything

```sh
bun run packages/taxonomy/scripts/map-ebay-to-shopify-v2.ts
```

### Map a single vertical

```sh
bun run packages/taxonomy/scripts/map-ebay-to-shopify-v2.ts --category "Baby"
```

The `--category` flag matches the `vertical` field in the eBay source file (e.g., "Baby", "Consumer Electronics", "Collectibles"). Case-sensitive, must match exactly.

### Resume after interruption

```sh
bun run packages/taxonomy/scripts/map-ebay-to-shopify-v2.ts --resume
```

Skips verticals that already have a mapping file in `mappings/categories/`. To re-map a specific vertical, delete its file first:

```sh
rm packages/taxonomy/data/integrations/ebay/134/mappings/categories/baby.json
bun run packages/taxonomy/scripts/map-ebay-to-shopify-v2.ts --category "Baby"
```

### Tune target list size

```sh
bun run packages/taxonomy/scripts/map-ebay-to-shopify-v2.ts --max-targets 300
```

Default is 200. Higher values increase accuracy but cost more tokens. Lower values save tokens but may miss good matches (Pass 2 synonym retry will catch most misses).

Guideline:
- `150` — Aggressive savings, good for well-overlapping verticals (Baby, Pet Supplies)
- `200` — Default, good balance for most verticals
- `300` — Conservative, use for catch-all verticals (Collectibles, Antiques) if accuracy is low

### Combine options

```sh
bun run packages/taxonomy/scripts/map-ebay-to-shopify-v2.ts --category "Collectibles" --max-targets 300
```

## What happens during a run

### Startup

1. Detects eBay version (latest directory under `integrations/ebay/`)
2. Loads all Shopify leaf fullnames into memory (~5K entries, loaded once)
3. Builds Shopify fullname-to-ID lookup (used at the end for ID resolution)

### Per vertical

For each eBay vertical file (e.g., `baby.json`):

**Pass 1 — Local filter + AI mapping**
- Splits leaf categories into batches of 100
- For each batch: extracts tokens, scores Shopify fullnames, takes top N, sends to AI
- Console shows: batch progress, target count, token usage, mapped count

**Pass 2 — Synonym retry (only if needed)**
- Collects entries with confidence < 0.7 and any missing entries
- For each retry batch: AI generates synonyms, re-scores with expanded vocabulary, AI re-maps
- Typically handles 5-15% of entries

**Output**
- Writes `mappings/categories/{slug}.json` with all mappings for that vertical
- Reports high-confidence % and low-confidence count

### Consolidation

After all verticals complete, merges per-category files into `mappings/mappings.json` — the flat lookup used by `lookupCategory()` at runtime. Skipped when using `--category`.

## Console output guide

```
Using eBay version: 134
Max targets per batch: 200
Model: gpt-4.1-mini

Loading Shopify leaf fullnames...
  4832 Shopify leaf categories loaded

Processing 34 verticals (concurrency: 3)...

[Baby]
  153 leaves, 12 non-leaves
  Pass 1: 153 leaves (2 batches, max 200 targets/batch)
  Batch 1/2 (187 targets)... [tokens: 4200in + 1800out = 6000] 100 mapped
  Batch 2/2 (142 targets)... [tokens: 2800in + 900out = 3700] 53 mapped
  Pass 1 result: 153 mapped, 8 low-confidence, 0 missing

  Pass 2: Retrying 8 low-confidence/missing with synonym expansion...
  Retry batch 1/1: generating synonyms... [synonyms: 300in + 150out = 450] (165 targets)... [tokens: 2100in + 200out = 2300] 8 mapped
  Resolved: 153 leaves
  Non-leaves: 12 placeholders
  -> baby.json (94% high confidence, 2 low)
```

Key things to watch:
- **Targets per batch** — Should be well below the full catalog (~5K). If consistently hitting max-targets, the filter is working.
- **Pass 2 retry count** — If > 30% of entries need retry, consider increasing `--max-targets`.
- **High confidence %** — Target 85%+ per vertical. Below 70% suggests the vertical needs manual review.

## After the run

### Check quality

```sh
bun run packages/taxonomy/scripts/extract-low-confidence.ts
```

Reports unmapped, uncategorized, and low-confidence entries across all verticals. Use this to decide which verticals need re-mapping with higher `--max-targets` or manual review.

### Re-map specific verticals

```sh
# Delete the mapping file and re-run with tuned settings
rm packages/taxonomy/data/integrations/ebay/134/mappings/categories/collectibles.json
bun run packages/taxonomy/scripts/map-ebay-to-shopify-v2.ts --category "Collectibles" --max-targets 300
```

### Re-consolidate after partial re-maps

If you re-mapped individual verticals with `--category`, the flat lookup won't auto-update. Run the full script with `--resume` to trigger consolidation without re-processing completed verticals:

```sh
bun run packages/taxonomy/scripts/map-ebay-to-shopify-v2.ts --resume
```

## Differences from v1

| | v1 (`map-ebay-to-shopify.ts`) | v2 (`map-ebay-to-shopify-v2.ts`) |
|---|---|---|
| Target scoping | AI maps verticals, loads all leaves in matched Shopify vertical | Local token scoring per batch, no AI scoping call |
| Targets per batch | ~800 (full vertical) | ~200 (filtered, configurable) |
| Low-confidence retry | Full Shopify catalog (~5K targets) | AI synonyms + re-filtered ~200 targets |
| Temp files | Fullname extracts, target files, main-categories.json | None |
| Token usage (est.) | ~135K per vertical (500 leaves) | ~45K per vertical (500 leaves) |
| New option | N/A | `--max-targets` to tune filter size |
