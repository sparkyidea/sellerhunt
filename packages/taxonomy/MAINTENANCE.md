# Taxonomy Maintenance Guide

How to update, extend, and maintain the taxonomy data.

## Updating the Shopify taxonomy

When Shopify releases a new taxonomy version:

### 1. Pull the latest taxonomy

```bash
bun run packages/taxonomy/scripts/pull-shopify-categories.ts
```

This auto-fetches the latest release tag from GitHub, clones (or updates the cache), strips attributes/return_reasons/ancestors, removes GID prefixes, and writes 26 vertical files to `data/categories/`.

To use a local clone instead:

```bash
bun run packages/taxonomy/scripts/pull-shopify-categories.ts --repo-path /path/to/product-taxonomy
```

### 2. Verify and commit

```bash
cd packages/taxonomy && bun test
git diff data/categories/
git add data/categories/
git commit -m "chore: update Shopify taxonomy to <version>"
```

### 3. Re-run eBay mapping

If category IDs changed, regenerate the mapping. See [MAP-EBAY-TO-SHOPIFY.md](scripts/prompt/MAP-EBAY-TO-SHOPIFY.md).

### 4. Re-seed the database

```bash
bun run packages/taxonomy/scripts/generate-seed.ts
bun run db:seed
```

## Updating eBay categories

When eBay updates their category tree:

### 1. Pull the latest tree

```bash
bun run packages/taxonomy/scripts/pull-ebay-categories.ts
```

This fetches the tree via eBay's Commerce Taxonomy API (client credentials, no user OAuth). Output goes to `data/integrations/ebay/{version}/categories/` where `{version}` is the tree version from the API (e.g. `134`).

Environment: requires `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` in `apps/api/.env`.

### 2. Re-split from existing data (no API call)

```bash
bun run packages/taxonomy/scripts/pull-ebay-categories.ts --resume
```

Uses the latest existing version's `categories.json` to regenerate per-category files.

### 3. Re-run mapping and seed

```bash
# Re-map (see scripts/prompt/MAP-EBAY-TO-SHOPIFY.md)
# Then re-seed
bun run packages/taxonomy/scripts/generate-seed.ts
bun run db:seed
```

## Adding a new marketplace

To add a marketplace (e.g. Amazon):

### 1. Create the integration directory

```
data/integrations/amazon/{version}/
  categories/          Raw category files from the marketplace
  mappings/
    mappings.json    Flat lookup: { "marketplace_cat_id": "shopify_cat_id" }
    categories/      Detailed mapping files (optional)
```

### 2. Register in integrations.json

```json
{
  "integrations": [
    { "name": "ebay", "available_versions": ["ebay/134"], "site": "EBAY_US" },
    { "name": "amazon", "available_versions": ["amazon/2025-01"], "site": "AMAZON_US" }
  ]
}
```

### 3. Create a pull script

```
scripts/pull-amazon-categories.ts
```

Follow the pattern of `pull-ebay-categories.ts`: fetch from API, flatten, write to versioned directory.

### 4. Create a mapping prompt

```
scripts/prompt/MAP-AMAZON-TO-SHOPIFY.md
```

Follow the pattern of `MAP-EBAY-TO-SHOPIFY.md`.

### 5. Runtime lookup works automatically

`lookupCategory("amazon", "12345")` will automatically resolve the latest version under `data/integrations/amazon/` and read `mappings/mappings.json`.

## Adding localization

When adding a new locale:

### 1. Create the locale file

```
data/localizations/categories/{locale}.json
```

Format (follows Shopify's pattern):

```json
{
  "aa": { "name": "Vêtements et accessoires" },
  "aa-1": { "name": "Vêtements" },
  "aa-1-1": { "name": "Vêtements de sport" }
}
```

### 2. Update the lookup API

Add a `locale` parameter to `getCategory()` and `getCategoryTree()` that overlays localized names on top of the English defaults.

## Versioning strategy

- **Canonical taxonomy** (`data/categories/`): version comes from Shopify's release tags (e.g. `2026-05-unstable`)
- **Marketplace integrations**: versioned by the marketplace's own tree version (e.g. eBay tree `134`)
- **Mappings**: live inside the marketplace version directory they target. When either the canonical taxonomy or the marketplace tree updates, mappings should be regenerated under the new version

## Directory conventions

| Directory | Committed | Purpose |
|-----------|-----------|---------|
| `data/categories/` | Yes | Canonical taxonomy (Shopify-sourced) |
| `data/integrations/` | Yes | Marketplace categories + mappings, versioned |
| `data/localizations/` | Yes | i18n files |
| `temp/` | No (gitignored) | Agent batch files, intermediate results |
