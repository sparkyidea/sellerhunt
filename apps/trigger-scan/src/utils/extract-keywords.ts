/**
 * Title tokenizer for the listing → keyword feedback loop.
 *
 * Quality bar is "decent" not "perfect": extracted keywords feed back into
 * `scan_keyword` as discovery seeds, and bad extraction means wasted scan
 * budget on noise terms. Worth keeping the algorithm boring and predictable
 * — refine when extracted-keyword scans show clear diminishing returns.
 *
 * Algorithm:
 *   1. Lowercase the title.
 *   2. Split on non-word characters.
 *   3. Drop tokens shorter than 3 chars and tokens in the stopword set.
 *   4. Drop pure-numeric tokens (years, prices, model numbers — too noisy).
 *   5. Cap output to MAX_TOKENS unique tokens to bound DB writes per listing.
 */

const MIN_TOKEN_LENGTH = 3;
const MAX_TOKENS = 16;

const WORD_SPLIT_RE = /\W+/;
const NUMERIC_RE = /^\d+$/;

/**
 * Tiny stopword set — the obvious filler English nouns/verbs that show up in
 * eBay/Shop titles and add no discovery value. Intentionally small; we'd
 * rather over-include and let the scan results decide than over-prune here.
 */
const STOPWORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "this",
  "that",
  "your",
  "you",
  "are",
  "was",
  "but",
  "not",
  "all",
  "any",
  "can",
  "has",
  "have",
  "had",
  "new",
  "old",
  "one",
  "two",
  "set",
  "lot",
  "pcs",
  "pieces",
  "size",
  "color",
  "free",
  "shipping",
  "ship",
  "ships",
  "shipped",
  "fast",
  "best",
  "great",
  "nice",
  "top",
  "high",
  "quality",
  "premium",
  "official",
  "genuine",
  "authentic",
  "original",
  "real",
  "brand",
]);

export function extractKeywords(title: string | null | undefined): string[] {
  if (!title) {
    return [];
  }

  const seen = new Set<string>();
  for (const raw of title.toLowerCase().split(WORD_SPLIT_RE)) {
    if (raw.length < MIN_TOKEN_LENGTH) {
      continue;
    }
    if (STOPWORDS.has(raw)) {
      continue;
    }
    if (NUMERIC_RE.test(raw)) {
      continue;
    }
    seen.add(raw);
    if (seen.size >= MAX_TOKENS) {
      break;
    }
  }

  return [...seen];
}
