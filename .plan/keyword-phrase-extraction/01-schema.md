# 01 — Schema

Target = `main` baseline + only what the flow needs.

- `scan_keyword`: surrogate `id` (DB default `gen_random_uuid()`, FK target),
  unique `(marketplace, keyword)`, `source` manual|llm. No alias table, no
  `category_hint`.
- `scan_listing`: `keyword_id` FK set-null + index; `keyword_attempts`
  integer NOT NULL default 0.
- `scan_config`: `listing_scan_batch_size` 50, `keyword_llm_enabled` true.
  Model, effort, request cap, leaf concurrency and the retry page size are
  code constants, not columns (dropped in `0002`).
- Migration: journal restored from `main`, then `bun db:generate` → one
  `0001_*.sql`. Shown, never pushed/migrated by the agent.
