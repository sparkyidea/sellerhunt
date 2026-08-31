/**
 * Extract eBay leaf categories with low confidence or no mapping.
 *
 * Reads all per-category mapping files and outputs a report of entries that
 * need manual review or a re-run:
 *   - unmapped:        mappingSource === "unmapped" (AI failed to produce an entry)
 *   - low-confidence:  leaf entries with confidence < LOW_CONFIDENCE_THRESHOLD
 *   - uncategorized:   mapped to Shopify "Uncategorized" (shopifyCategoryId === "na")
 *
 * Skipped (non-leaf) entries are excluded — they intentionally have no mapping.
 *
 * Usage:
 *   bun run packages/taxonomy/scripts/extract-low-confidence.ts
 *
 * Options:
 *   --threshold <0-1>   Confidence threshold (default: 0.7)
 *   --category <name>   Filter to a single eBay category
 *   --unmapped-only      Only extract unmapped entries (mappingSource === "unmapped")
 *
 * Output:
 *   data/integrations/ebay/{version}/mappings/low-confidence.json
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dir, "../data");
const EBAY_INTEGRATIONS_DIR = join(DATA_DIR, "integrations/ebay");
const DEFAULT_THRESHOLD = 0.7;

interface MappingEntry {
  confidence: number;
  ebayFullName: string;
  ebayId: string;
  mappingSource: string;
  shopifyCategoryId: string;
  shopifyFullName: string;
}

interface CategoryFile {
  ebayCategory: string;
  highConfidence: number;
  lowConfidence: number;
  mappings: MappingEntry[];
  shopifyCategories: string[];
  totalMapped: number;
}

interface ReviewEntry {
  confidence: number;
  ebayCategory: string;
  ebayFullName: string;
  ebayId: string;
  reason: "low-confidence" | "uncategorized" | "unmapped";
  shopifyCategoryId: string;
  shopifyFullName: string;
}

async function resolveEbayVersion(): Promise<string> {
  const entries = await readdir(EBAY_INTEGRATIONS_DIR);
  const versions = entries
    .filter((f) => !(f.startsWith(".") || f.endsWith(".json")))
    .sort();
  const latest = versions.at(-1);
  if (!latest) {
    throw new Error(
      "No eBay version directories found under integrations/ebay/"
    );
  }
  return latest;
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const thresholdArg = args.includes("--threshold")
  ? Number.parseFloat(args[args.indexOf("--threshold") + 1] ?? "")
  : Number.NaN;
const threshold = Number.isNaN(thresholdArg) ? DEFAULT_THRESHOLD : thresholdArg;

const categoryFilter = args.includes("--category")
  ? args[args.indexOf("--category") + 1]
  : null;

const unmappedOnly = args.includes("--unmapped-only");

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const ebayVersion = await resolveEbayVersion();
const perCategoryDir = join(
  EBAY_INTEGRATIONS_DIR,
  ebayVersion,
  "mappings/categories"
);
const outputPath = join(
  EBAY_INTEGRATIONS_DIR,
  ebayVersion,
  "mappings/low-confidence.json"
);

console.log(`eBay version: ${ebayVersion}`);
console.log(`Threshold: < ${threshold}`);
if (categoryFilter) {
  console.log(`Filter: ${categoryFilter}`);
}

const files = (await readdir(perCategoryDir))
  .filter((f) => f.endsWith(".json"))
  .sort();

const review: ReviewEntry[] = [];
const stats = {
  categories: 0,
  lowConfidence: 0,
  total: 0,
  uncategorized: 0,
  unmapped: 0,
};

for (const file of files) {
  const data = JSON.parse(
    await readFile(join(perCategoryDir, file), "utf-8")
  ) as CategoryFile;

  if (categoryFilter && data.ebayCategory !== categoryFilter) {
    continue;
  }

  stats.categories++;

  for (const m of data.mappings) {
    // Skip non-leaf placeholders
    if (m.mappingSource === "skipped") {
      continue;
    }

    stats.total++;

    let reason: ReviewEntry["reason"] | null = null;

    if (m.mappingSource === "unmapped") {
      reason = "unmapped";
      stats.unmapped++;
    } else if (!unmappedOnly && m.shopifyCategoryId === "na") {
      reason = "uncategorized";
      stats.uncategorized++;
    } else if (!unmappedOnly && m.confidence < threshold) {
      reason = "low-confidence";
      stats.lowConfidence++;
    }

    if (reason) {
      review.push({
        reason,
        ebayCategory: data.ebayCategory,
        ebayId: m.ebayId,
        ebayFullName: m.ebayFullName,
        shopifyCategoryId: m.shopifyCategoryId,
        shopifyFullName: m.shopifyFullName,
        confidence: m.confidence,
      });
    }
  }
}

const reviewCount = review.length;
const pct =
  stats.total > 0 ? ((reviewCount / stats.total) * 100).toFixed(1) : "0";

console.log(`\nResults across ${stats.categories} categories:`);
console.log(`  Total leaf mappings : ${stats.total}`);
console.log(`  Needs review        : ${reviewCount} (${pct}%)`);
console.log(`    unmapped          : ${stats.unmapped}`);
console.log(`    uncategorized     : ${stats.uncategorized}`);
console.log(`    low-confidence    : ${stats.lowConfidence}`);

const output = {
  generatedAt: new Date().toISOString(),
  threshold,
  stats: {
    ...stats,
    needsReview: reviewCount,
  },
  entries: review,
};

if (!categoryFilter) {
  await writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nSaved -> ${outputPath}`);
}
