# 02 — LLM stage

- `keywords/extract-keywords.ts` — Responses API structured output
  `{ items: [{ index, searchPhrase }] }`, `instructions` = stable prompt,
  `input` = `[index] (category) title` lines, title verbatim. Reasoning
  models get `reasoning.effort: "low"` ("minimal" leaks condition/colors),
  others `temperature: 0`.
- `keywords/llm-stage.ts` — pure orchestration over an injected parser +
  `KeywordStore`; one call per `MAX_TITLES_PER_REQUEST` (50); never throws;
  failed batch / missing answer / empty phrase / failed write → attempt
  counted. Phrase stored as returned (trimmed only).
- `nodes/scan/keyword-store.ts` — DB store: `scan_keyword` upsert on
  `(marketplace, keyword)` (bumps `last_seen_at` only, reuses manual seeds),
  then `scan_listing.keyword_id`; attempts counter.
- `nodes/scan/resolve-keywords-with-llm.ts` — IO wrapper: kill switch, key
  check (skip without spending), pickers for the retry task.
- `scan-listings-by-ids` leaf: after the paced fetches, send
  `verdicts.filter(fit && isNew)` titles from memory. Runs even after a
  persona abort.
- `resolve-listing-keywords`: manual retry only (`listingIds?`), skips when
  the switch is off.
