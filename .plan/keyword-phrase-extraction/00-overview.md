# Keyword extraction (LLM-only)

**Branch:** `jingerpie/group-listings-by-product`

## Goal

Replace the unigram title tokenizer with LLM keyword extraction: every newly
inserted, fitting listing has its title sent to OpenAI once, inline at the end
of the `scan-listings-by-ids` leaf, and the returned phrase becomes (or reuses)
a `scan_keyword` row linked from `scan_listing.keyword_id`. No local
normalization or scoring at either end. A keyword is a search term for the
scanner, never a product identity (product matching is identifier-based,
separate work).

## Decisions (user, 2026-09-03)

- Dev only; the DB was wiped. One clean migration regenerated from the `main`
  schema (the earlier `0001`–`0005` were dropped from the branch).
- K (`listing_scan_batch_size`) = `MAX_TITLES_PER_REQUEST` (code constant) = 50
  → one leaf, one OpenAI call. Model, effort and the cap are constants beside
  the prompt; the only runtime knob is `keyword_llm_enabled`. One box scraping 50 listings per run is accepted.
- Titles go to the model verbatim; the phrase is stored as returned (trimmed;
  the prompt asks for lowercase). Empty phrase = unresolved.
- Rescans never re-extract: the listing upsert returns `isNew` and only new
  rows are sent. No backfill of pre-existing listings.
- `keyword_llm_enabled` default on; off / no key → listings persist unresolved
  with no attempt spent. `resolve-listing-keywords` is a manual retry tool
  (cap 3 attempts per listing).

## Done when

- `bun --cwd apps/trigger-scan test`, `bun run check-types`, `bun run check` pass.
- Migration generated and shown (never applied by the agent).
- Docs updated; this folder deleted.

## Files

- `apps/trigger-scan/src/keywords/{extract-keywords,llm-stage,openai-client}.ts` (+ tests)
- `apps/trigger-scan/src/nodes/scan/{keyword-store,resolve-keywords-with-llm,upsert-scan-listing,scan-one-listing}.ts`
- `apps/trigger-scan/src/workflows/scan/{scan-listings-by-ids,resolve-listing-keywords}.ts`
- `apps/trigger-scan/src/utils/scan-config.ts`
- `packages/db/src/schema/scan.ts` (+ generated migration), `packages/db/src/seed/scan.ts`
- `.agents/**`, `apps/trigger-scan/docs/task-payloads.md`
