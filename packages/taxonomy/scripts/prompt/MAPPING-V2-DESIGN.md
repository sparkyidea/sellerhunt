# Category Mapping v2 — Design Document

How the token-efficient eBay-to-Shopify category mapping works and why it was built this way.

## Problem

We need to map ~15K eBay leaf categories to ~5K Shopify leaf categories using AI. The AI needs to see both the source (eBay) and target (Shopify) fullnames to make a semantic match.

The core tension: **the AI needs enough Shopify targets to find a good match, but sending too many wastes tokens and money.**

## v1 Approach (and its cost problem)

v1 used a two-step scoping strategy:

1. **AI vertical mapping** — An AI call maps eBay top-level categories (e.g., "Baby") to Shopify top-level categories (e.g., "Baby & Toddler"). This was a one-time call.
2. **Scoped target list** — For each eBay vertical, load ALL leaf fullnames from the matched Shopify verticals. Send this entire list with every batch.

The problem: a vertical like "Consumer Electronics" maps to Shopify "Electronics", which has ~800 leaf categories. Every batch of 100 eBay categories sends all 800 targets in the prompt. For 5 batches, that's 800 targets repeated 5 times = 4,000 redundant target entries.

**Estimated tokens per vertical (500 leaves, 800 targets):**
- 5 batches x (100 sources x ~30 tokens + 800 targets x ~30 tokens) = **~135K input tokens**

For "catch-all" verticals like Collectibles or Antiques, the scoping didn't help at all — they loaded ALL Shopify categories (~5K targets) into every batch.

## v2 Approach — Local Token Filtering

Instead of scoping by vertical, v2 filters targets **per batch** using local text matching. No AI call needed for scoping.

### Pass 1: Local Filter + AI Mapping

For each batch of 100 eBay fullnames:

1. **Tokenize** the batch — split all 100 eBay fullnames into lowercase tokens, removing stop words ("and", "of", "the", etc.) and short words (< 2 chars)

   ```
   "Books & Magazines > Textbooks, Education & Reference > Language Courses"
   → { books, magazines, textbooks, education, reference, language, courses }
   ```

2. **Score** every Shopify leaf fullname by token overlap — for each Shopify fullname, count how many of its tokens appear in the batch token set. Normalize by the Shopify fullname's token count to get a 0-1 score.

   ```
   Shopify: "Media > Books > Textbooks > Language Learning"
   Tokens:  { media, books, textbooks, language, learning }
   Overlap with batch: { books, textbooks, language } → 3/5 = 0.6
   ```

3. **Take top N** (default 200) by score. This is the filtered target list for this batch.

4. **AI mapping** — Send the 100 sources + ~200 filtered targets to the AI. Same numbered-index prompt format as v1.

**Why this works:** Categories that share vocabulary are likely to be semantically related. A batch about "Books > Textbooks > Language Courses" will naturally pull in Shopify categories containing "books", "textbooks", "language", etc.

**Why 200 targets?** This is configurable (`--max-targets`). 200 gives ~75% token reduction vs 800 while keeping enough candidates for accurate matching. The scoring ensures the most relevant candidates are included.

**Estimated tokens per vertical (500 leaves):**
- 5 batches x (100 sources x ~30 tokens + 200 targets x ~30 tokens) = **~45K input tokens**
- **~67% reduction** vs v1

### Pass 2: AI Synonym Expansion (Low-Confidence Retry)

Pass 1's local filter fails when eBay and Shopify use different vocabulary for the same concept:

- eBay: `Cell Phones & Accessories` → Shopify: `Electronics > Communications > Telephony`
- eBay: `iPod & Digital Media Players` → Shopify: `Electronics > Audio > Media Streaming Devices`

The token "telephony" never appears in the eBay fullname, so it scores 0 in Pass 1.

For items where Pass 1 returns confidence < 0.7 or fails entirely:

1. **AI synonym generation** — Send the failed eBay fullnames to the AI and ask for 3-5 synonyms/related terms per category. This is a small, cheap call.

   ```
   "Cell Phones & Accessories" → ["telephony", "mobile", "smartphone", "wireless", "handset"]
   ```

2. **Expanded scoring** — Combine original batch tokens + AI synonyms into one token set. Re-score all Shopify fullnames against this expanded set.

3. **AI mapping** — Send the failed sources + re-filtered targets to the AI for a second mapping attempt.

**Why not use synonyms in Pass 1?** Most categories (70-90%) match fine with direct token overlap. The synonym call would be wasted tokens for the majority. By only using it on failures, we keep the cost proportional to the difficulty.

### Comparison

| | v1 | v2 |
|---|---|---|
| Target selection | AI vertical mapping (one-time) + load all leaves in vertical | Local token scoring per batch |
| Targets per batch | ~800 (full vertical) | ~200 (filtered) |
| Low-confidence retry | Re-send against full Shopify catalog (~5K targets) | AI synonyms + re-filter to ~200 |
| Extra AI calls | 1 (vertical mapping) | 0 for Pass 1; 1 small synonym call per retry batch |
| Temp files needed | fullname extracts, target-fullname files, main-categories.json | None |
| Input tokens (500 leaves) | ~135K | ~45K + small synonym overhead |
| API calls (500 leaves) | 5 batches + 1 vertical mapping | 5 batches + ~1 retry batch + ~1 synonym call |

### What v2 Removes

v1 had 6 steps. v2 removes 3 of them:

- **Step 1 (extract fullnames to temp files)** — Not needed. v2 loads Shopify leaves directly into memory once.
- **Step 2 (AI main-category mapping)** — Not needed. Local token scoring replaces vertical scoping entirely.
- **Step 3 (build scoped target fullnames)** — Not needed. Target filtering happens inline per batch.

### Edge Cases

**Catch-all verticals (Antiques, Collectibles, etc.):** These were the worst case in v1 — they loaded all ~5K Shopify targets. In v2, local filtering handles them the same as any other vertical. A batch about "Antiques > Furniture > Chairs" will naturally score Shopify furniture categories highest regardless of which Shopify vertical they belong to.

**Very small verticals (Art, Gift Cards):** If a vertical has < 100 leaves, it's a single batch. The local filter may return fewer than `--max-targets` candidates, which is fine — fewer targets means fewer tokens.

**Empty token overlap:** If an eBay fullname has no token overlap with any Shopify fullname (extremely rare), it will land in Pass 2 where synonyms bridge the vocabulary gap.

## Output Format

Identical to v1 — per-category JSON files and a flat `mappings.json` lookup. The output is fully compatible with `lookupCategory()`.
