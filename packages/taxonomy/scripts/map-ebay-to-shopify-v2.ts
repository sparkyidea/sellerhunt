/**
 * Map eBay categories to Shopify taxonomy — token-efficient v2.
 *
 * Key difference from v1: instead of sending the entire scoped Shopify target
 * list with every batch, we use local token-based scoring to pre-filter targets
 * per batch. This reduces input tokens by ~60-70%.
 *
 * Pipeline:
 *   Pass 1 — Local token filter + AI mapping
 *     1a. Extract tokens from the batch of eBay fullnames
 *     1b. Score every Shopify leaf fullname by token overlap
 *     1c. Take top N candidates as the target list
 *     1d. AI maps source → target (numbered index, same as v1)
 *
 *   Pass 2 — AI synonym expansion + local filter + AI mapping
 *     2a. Collect low-confidence / missing entries from Pass 1
 *     2b. AI generates synonyms & related terms for the eBay fullnames
 *     2c. Use expanded terms to re-score Shopify fullnames
 *     2d. AI maps against the refined target list
 *
 *   Resolve — Fullname pairs → eBay/Shopify IDs (deterministic)
 *   Consolidate — Merge per-vertical files into flat lookup
 *
 * Usage:
 *   bun run packages/taxonomy/scripts/map-ebay-to-shopify-v2.ts
 *   (reads OPENAI_API_KEY from packages/taxonomy/scripts/.env)
 *
 * Options:
 *   --category <name>   Process only one category (e.g., "Consumer Electronics")
 *   --resume            Skip categories that already have mapping files
 *   --max-targets <n>   Max Shopify targets per batch (default: 200)
 *
 * Output: packages/taxonomy/data/integrations/ebay/{version}/mappings/
 *   categories/{slug}.json   per-category detail files
 *   mappings.json          flat lookup consumed by lookupCategory()
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config({ path: resolve(import.meta.dirname, ".env") });

const DATA_DIR = join(import.meta.dir, "../data");
const SHOPIFY_DIR = join(DATA_DIR, "categories");
const EBAY_INTEGRATIONS_DIR = join(DATA_DIR, "integrations/ebay");
const BATCH_SIZE = 100;
const LOW_CONFIDENCE_THRESHOLD = 0.7;
const CONCURRENCY = 3;
const MODEL = "gpt-4.1-mini";
const DEFAULT_MAX_TARGETS = 200;
const JSON_ARRAY_RE = /\[[\s\S]*\]/;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface EbayCategory {
  fullName: string;
  id: string;
  leaf: boolean;
  level: number;
  name: string;
  parentId: string | null;
}

interface ShopifyCategory {
  children: { id: string; name: string }[];
  full_name: string;
  id: string;
  level: number;
  name: string;
  parent_id: string | null;
}

interface MappingEntry {
  confidence: number;
  ebayFullName: string;
  ebayId: string;
  mappingSource: string;
  shopifyCategoryId: string;
  shopifyFullName: string;
}

interface FullnameMappingEntry {
  confidence: number;
  source: string;
  target: string;
}

// ---------------------------------------------------------------------------
// SHOPIFY_FILES — prefix → filename
// ---------------------------------------------------------------------------

const SHOPIFY_FILES: Record<string, string> = {
  aa: "aa_apparel_and_accessories.json",
  ae: "ae_arts_and_entertainment.json",
  ap: "ap_animals_and_pet_supplies.json",
  bi: "bi_business_and_industrial.json",
  bt: "bt_baby_and_toddler.json",
  bu: "bu_bundles.json",
  co: "co_cameras_and_optics.json",
  el: "el_electronics.json",
  fb: "fb_food_beverages_and_tobacco.json",
  fr: "fr_furniture.json",
  gc: "gc_gift_cards.json",
  ha: "ha_hardware.json",
  hb: "hb_health_and_beauty.json",
  hg: "hg_home_and_garden.json",
  lb: "lb_luggage_and_bags.json",
  ma: "ma_mature.json",
  me: "me_media.json",
  na: "na_uncategorized.json",
  os: "os_office_supplies.json",
  pa: "pa_product_add_ons.json",
  rc: "rc_religious_and_ceremonial.json",
  se: "se_services.json",
  sg: "sg_sporting_goods.json",
  so: "so_software.json",
  tg: "tg_toys_and_games.json",
  vp: "vp_vehicles_and_parts.json",
};

// ---------------------------------------------------------------------------
// Stop words — common words that don't help distinguish categories
// ---------------------------------------------------------------------------

const TOKENIZE_RE = /[\s>,.&/()[\]\-–—]+/;

// Categories matching these patterns are auto-marked uncategorized (no AI needed)
const EXCLUDED_PATTERNS = [
  "test category",
  "internal use",
  "ebay use only",
  "blocked category",
];

function isExcludedCategory(fullName: string): boolean {
  const lower = fullName.toLowerCase();
  return EXCLUDED_PATTERNS.some((pattern) => lower.includes(pattern));
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "other",
  "others",
  "not",
  "elsewhere",
  "classified",
  "general",
  "misc",
  "miscellaneous",
  "unspecified",
]);

// ---------------------------------------------------------------------------
// Token extraction & scoring
// ---------------------------------------------------------------------------

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  // Split on separators: > , & / ( ) - and whitespace
  const parts = text.toLowerCase().split(TOKENIZE_RE);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length >= 2 && !STOP_WORDS.has(trimmed)) {
      tokens.add(trimmed);
    }
  }
  return tokens;
}

function extractBatchTokens(fullnames: string[]): Set<string> {
  const all = new Set<string>();
  for (const name of fullnames) {
    for (const token of tokenize(name)) {
      all.add(token);
    }
  }
  return all;
}

interface ScoredTarget {
  fullName: string;
  score: number;
}

function scoreTargets(
  batchTokens: Set<string>,
  shopifyFullnames: string[]
): ScoredTarget[] {
  const scored: ScoredTarget[] = [];
  for (const fullName of shopifyFullnames) {
    const targetTokens = tokenize(fullName);
    let overlap = 0;
    for (const token of targetTokens) {
      if (batchTokens.has(token)) {
        overlap++;
      }
    }
    if (overlap > 0) {
      // Normalize: ratio of target tokens matched
      scored.push({
        fullName,
        score: overlap / targetTokens.size,
      });
    }
  }
  // Sort by score descending, then alphabetical for stability
  scored.sort(
    (a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName)
  );
  return scored;
}

function filterTargetsForBatch(
  batchFullnames: string[],
  allShopifyFullnames: string[],
  maxTargets: number
): string[] {
  const batchTokens = extractBatchTokens(batchFullnames);
  const scored = scoreTargets(batchTokens, allShopifyFullnames);
  return scored.slice(0, maxTargets).map((s) => s.fullName);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function resolveEbayVersion(): Promise<string> {
  const entries = await readdir(EBAY_INTEGRATIONS_DIR);
  const versions = entries.filter(
    (f) => !(f.startsWith(".") || f.endsWith(".json"))
  );
  versions.sort();
  const latest = versions.at(-1);
  if (!latest) {
    throw new Error(
      "No eBay version directories found under integrations/ebay/"
    );
  }
  return latest;
}

async function loadAllShopifyLeafFullnames(): Promise<string[]> {
  const all: string[] = [];
  for (const filename of Object.values(SHOPIFY_FILES)) {
    const content = await readFile(join(SHOPIFY_DIR, filename), "utf-8");
    const data = JSON.parse(content) as { categories: ShopifyCategory[] };
    for (const c of data.categories) {
      if (c.children.length === 0) {
        all.push(c.full_name);
      }
    }
  }
  return all;
}

async function buildShopifyFullnameToId(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const filename of Object.values(SHOPIFY_FILES)) {
    const content = await readFile(join(SHOPIFY_DIR, filename), "utf-8");
    const data = JSON.parse(content) as { categories: ShopifyCategory[] };
    for (const c of data.categories) {
      map.set(c.full_name, c.id);
    }
  }
  return map;
}

function buildEbayFullnameToId(
  categories: EbayCategory[]
): Map<string, string> {
  return new Map(categories.map((c) => [c.fullName, c.id]));
}

// ---------------------------------------------------------------------------
// Pass 1 — Local filter + AI mapping
// ---------------------------------------------------------------------------

async function mapBatchWithLocalFilter(
  client: OpenAI,
  sourceBatch: string[],
  filteredTargets: string[]
): Promise<{ entries: FullnameMappingEntry[]; missing: string[] }> {
  const sourceSet = new Set(sourceBatch);

  const numberedTargets = filteredTargets
    .map((name, i) => `${i + 1}. ${name}`)
    .join("\n");

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `Map each source eBay category to the best matching Shopify target category.

SOURCE CATEGORIES (eBay — copy these strings verbatim into the "source" field):
${sourceBatch.join("\n")}

TARGET CATEGORIES (Shopify — identified by number):
${numberedTargets}

Rules:
- "source" MUST be an exact copy of a string from SOURCE CATEGORIES
- "targetIndex" MUST be the integer number (1-based) from TARGET CATEGORIES
- Do NOT return a target string — return the number only
- Match by semantic meaning: "Antiques > Furniture > Chairs" → a Furniture target
- Prefer more-specific (deeper) target categories when available
- If no good match exists, use the most appropriate top-level target with confidence < 0.5
- Output ONLY the JSON array, no other text

JSON array of { "source": "...", "targetIndex": <number>, "confidence": 0.0-1.0 }:`,
      },
    ],
  });

  const { prompt_tokens, completion_tokens, total_tokens } =
    response.usage ?? {};
  process.stdout.write(
    ` [tokens: ${prompt_tokens ?? "?"}in + ${completion_tokens ?? "?"}out = ${total_tokens ?? "?"}]`
  );

  const text = response.choices[0]?.message.content ?? "";
  const jsonMatch = text.match(JSON_ARRAY_RE);
  if (!jsonMatch) {
    console.error("  Failed to parse batch response:", text.slice(0, 200));
    return { entries: [], missing: sourceBatch };
  }

  const parsed = JSON.parse(jsonMatch[0]) as Array<{
    confidence: number;
    source: string;
    targetIndex: number;
  }>;

  const entries: FullnameMappingEntry[] = [];
  const returnedSources = new Set<string>();

  for (const entry of parsed) {
    if (!sourceSet.has(entry.source)) {
      console.warn(
        `  Invalid source (not in input): "${entry.source.slice(0, 60)}"`
      );
      continue;
    }
    const idx = entry.targetIndex - 1;
    if (idx < 0 || idx >= filteredTargets.length) {
      console.warn(
        `  Invalid targetIndex ${entry.targetIndex} (out of range 1-${filteredTargets.length}) for "${entry.source.slice(0, 60)}"`
      );
      continue;
    }
    entries.push({
      source: entry.source,
      // biome-ignore lint/style/noNonNullAssertion: idx is bounds-checked above
      target: filteredTargets[idx]!,
      confidence: entry.confidence,
    });
    returnedSources.add(entry.source);
  }

  const missing = sourceBatch.filter((s) => !returnedSources.has(s));
  return { entries, missing };
}

async function pass1MapByFullname(
  client: OpenAI,
  sourceFullnames: string[],
  allShopifyFullnames: string[],
  maxTargets: number
): Promise<{
  mappings: Map<string, FullnameMappingEntry>;
  missingSources: string[];
}> {
  const mappings = new Map<string, FullnameMappingEntry>();
  const allMissing: string[] = [];

  for (let i = 0; i < sourceFullnames.length; i += BATCH_SIZE) {
    const batch = sourceFullnames.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sourceFullnames.length / BATCH_SIZE);

    // Local filter: score & select top targets for this batch
    const filteredTargets = filterTargetsForBatch(
      batch,
      allShopifyFullnames,
      maxTargets
    );

    process.stdout.write(
      `  Batch ${batchNum}/${totalBatches} (${filteredTargets.length} targets)...`
    );

    try {
      const { entries, missing } = await mapBatchWithLocalFilter(
        client,
        batch,
        filteredTargets
      );
      for (const entry of entries) {
        mappings.set(entry.source, entry);
      }
      allMissing.push(...missing);
      process.stdout.write(` ${entries.length} mapped\n`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      process.stdout.write(` ERROR: ${msg}\n`);
      allMissing.push(...batch);
    }
  }

  return { mappings, missingSources: allMissing };
}

// ---------------------------------------------------------------------------
// Pass 2 — AI synonym expansion + local filter + AI mapping
// ---------------------------------------------------------------------------

async function generateSynonyms(
  client: OpenAI,
  ebayFullnames: string[]
): Promise<Set<string>> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `For each eBay category below, list 3-5 synonyms or closely related terms that could help find the equivalent category in a different taxonomy (like Shopify). Focus on alternative names, related product types, and industry terms.

Categories:
${ebayFullnames.join("\n")}

Rules:
- Return a flat JSON array of unique keyword strings (lowercase)
- Include synonyms, alternative product names, and related industry terms
- Do NOT include the original category words — only NEW related terms
- Output ONLY the JSON array, no other text

JSON array of keyword strings:`,
      },
    ],
  });

  const { prompt_tokens, completion_tokens, total_tokens } =
    response.usage ?? {};
  process.stdout.write(
    ` [synonyms: ${prompt_tokens ?? "?"}in + ${completion_tokens ?? "?"}out = ${total_tokens ?? "?"}]`
  );

  const text = response.choices[0]?.message.content ?? "";
  const jsonMatch = text.match(JSON_ARRAY_RE);
  if (!jsonMatch) {
    console.warn("  Failed to parse synonym response");
    return new Set<string>();
  }

  const keywords = JSON.parse(jsonMatch[0]) as string[];
  return new Set(keywords.map((k) => k.toLowerCase().trim()));
}

async function pass2RetryWithSynonyms(
  client: OpenAI,
  lowConfidenceEntries: FullnameMappingEntry[],
  missingSources: string[],
  allShopifyFullnames: string[],
  existingMappings: Map<string, FullnameMappingEntry>,
  maxTargets: number
): Promise<{
  merged: Map<string, FullnameMappingEntry>;
  failedSources: string[];
}> {
  const retrySources = [
    ...new Set([
      ...lowConfidenceEntries.map((e) => e.source),
      ...missingSources,
    ]),
  ];

  if (retrySources.length === 0) {
    return { merged: existingMappings, failedSources: [] };
  }

  console.log(
    `\n  Pass 2: Retrying ${retrySources.length} low-confidence/missing with synonym expansion...`
  );

  const merged = new Map(existingMappings);
  const failedSources: string[] = [];

  // Process in batches
  for (let i = 0; i < retrySources.length; i += BATCH_SIZE) {
    const batch = retrySources.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(retrySources.length / BATCH_SIZE);

    process.stdout.write(
      `  Retry batch ${batchNum}/${totalBatches}: generating synonyms...`
    );

    // Step 2a: AI generates synonyms for this batch
    const synonyms = await generateSynonyms(client, batch);

    // Step 2b: Combine original tokens + synonyms for scoring
    const originalTokens = extractBatchTokens(batch);
    const expandedTokens = new Set([...originalTokens, ...synonyms]);

    // Step 2c: Score with expanded vocabulary
    const scored = scoreTargets(expandedTokens, allShopifyFullnames);
    const filteredTargets = scored.slice(0, maxTargets).map((s) => s.fullName);

    process.stdout.write(` (${filteredTargets.length} targets)...`);

    // Step 2d: AI mapping with refined targets
    try {
      const { entries, missing } = await mapBatchWithLocalFilter(
        client,
        batch,
        filteredTargets
      );
      for (const entry of entries) {
        merged.set(entry.source, entry);
      }
      failedSources.push(...missing);
      process.stdout.write(` ${entries.length} mapped\n`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      process.stdout.write(` ERROR: ${msg}\n`);
      failedSources.push(...batch);
    }
  }

  return { merged, failedSources };
}

// ---------------------------------------------------------------------------
// ID resolution
// ---------------------------------------------------------------------------

function resolveIds(
  fullnameMappings: Map<string, FullnameMappingEntry>,
  ebayFNtoId: Map<string, string>,
  shopifyFNtoId: Map<string, string>
): MappingEntry[] {
  const result: MappingEntry[] = [];
  for (const [source, entry] of fullnameMappings) {
    const ebayId = ebayFNtoId.get(source);
    if (!ebayId) {
      console.warn(
        `  Warning: no eBay id for fullname "${source.slice(0, 60)}"`
      );
      continue;
    }
    if (!shopifyFNtoId.has(entry.target)) {
      console.warn(
        `  Warning: no Shopify id for "${entry.target.slice(0, 60)}" — using "na"`
      );
    }
    result.push({
      ebayId,
      ebayFullName: source,
      shopifyCategoryId: shopifyFNtoId.get(entry.target) ?? "na",
      shopifyFullName: entry.target,
      confidence: entry.confidence,
      mappingSource: MODEL,
    });
  }
  return result;
}

function placeholderNonLeaves(nonLeaves: EbayCategory[]): MappingEntry[] {
  return nonLeaves.map((cat) => ({
    ebayId: cat.id,
    ebayFullName: cat.fullName,
    shopifyCategoryId: "",
    shopifyFullName: "",
    confidence: 0,
    mappingSource: "skipped",
  }));
}

function orderMappingsBySourceFile(
  mappings: MappingEntry[],
  sourceCategories: EbayCategory[]
): MappingEntry[] {
  const orderIndex = new Map(sourceCategories.map((c, i) => [c.id, i]));
  return [...mappings].sort((a, b) => {
    const ai = orderIndex.get(a.ebayId) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b.ebayId) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

// ---------------------------------------------------------------------------
// Per-category processing
// ---------------------------------------------------------------------------

interface SharedContext {
  allShopifyFullnames: string[];
  client: OpenAI;
  maxTargets: number;
  shopifyFNtoId: Map<string, string>;
}

async function processCategory(
  sourceFile: string,
  paths: { ebayBatsDir: string; perCategoryDir: string },
  ctx: SharedContext,
  opts: { categoryFilter: string | null; resume: boolean }
): Promise<number> {
  const slug = sourceFile.replace(".json", "");
  const sourceContent = await readFile(
    join(paths.ebayBatsDir, sourceFile),
    "utf-8"
  );
  const sourceData = JSON.parse(sourceContent) as {
    vertical: string;
    categories: EbayCategory[];
  };
  const { vertical: category, categories: sourceCategories } = sourceData;

  if (opts.categoryFilter && category !== opts.categoryFilter) {
    return 0;
  }

  const outputPath = join(paths.perCategoryDir, `${slug}.json`);

  if (opts.resume && existsSync(outputPath)) {
    console.log(`  SKIP ${category} (already mapped)`);
    const existing = JSON.parse(await readFile(outputPath, "utf-8")) as {
      mappings: MappingEntry[];
    };
    return existing.mappings.length;
  }

  const allLeaves = sourceCategories.filter((c) => c.leaf);
  const excludedLeaves = allLeaves.filter((c) =>
    isExcludedCategory(c.fullName)
  );
  const leaves = allLeaves.filter((c) => !isExcludedCategory(c.fullName));
  const nonLeaves = sourceCategories.filter((c) => !c.leaf);

  console.log(`\n[${category}]`);
  console.log(`  ${leaves.length} leaves, ${nonLeaves.length} non-leaves`);
  if (excludedLeaves.length > 0) {
    console.log(`  ${excludedLeaves.length} excluded (test/internal)`);
  }

  const allMappings: MappingEntry[] = [];

  // Mark excluded leaves as uncategorized (no AI needed)
  for (const cat of excludedLeaves) {
    allMappings.push({
      ebayId: cat.id,
      ebayFullName: cat.fullName,
      shopifyCategoryId: "na",
      shopifyFullName: "Uncategorized",
      confidence: 0,
      mappingSource: "excluded",
    });
  }

  if (leaves.length > 0) {
    const leafFullnames = leaves.map((c) => c.fullName);

    // Pass 1: local filter + AI mapping
    console.log(
      `  Pass 1: ${leaves.length} leaves (${Math.ceil(leaves.length / BATCH_SIZE)} batches, max ${ctx.maxTargets} targets/batch)`
    );

    const { mappings: initialMappings, missingSources } =
      await pass1MapByFullname(
        ctx.client,
        leafFullnames,
        ctx.allShopifyFullnames,
        ctx.maxTargets
      );

    const lowConfidence = [...initialMappings.values()].filter(
      (e) => e.confidence < LOW_CONFIDENCE_THRESHOLD
    );

    console.log(
      `  Pass 1 result: ${initialMappings.size} mapped, ${lowConfidence.length} low-confidence, ${missingSources.length} missing`
    );

    // Pass 2: synonym expansion for low-confidence items
    const { merged: mergedMappings, failedSources } =
      await pass2RetryWithSynonyms(
        ctx.client,
        lowConfidence,
        missingSources,
        ctx.allShopifyFullnames,
        initialMappings,
        ctx.maxTargets
      );

    const ebayFNtoId = buildEbayFullnameToId(sourceCategories);
    const resolved = resolveIds(mergedMappings, ebayFNtoId, ctx.shopifyFNtoId);
    allMappings.push(...resolved);

    // Track leaves that were never mapped after both passes
    const mappedFullnames = new Set(mergedMappings.keys());
    const unmappedLeaves = leaves.filter(
      (c) => !mappedFullnames.has(c.fullName)
    );
    for (const cat of unmappedLeaves) {
      allMappings.push({
        ebayId: cat.id,
        ebayFullName: cat.fullName,
        shopifyCategoryId: "",
        shopifyFullName: "",
        confidence: 0,
        mappingSource: "unmapped",
      });
    }

    if (unmappedLeaves.length > 0) {
      console.log(
        `  WARNING: ${unmappedLeaves.length} leaves unmapped after both passes`
      );
    }
    if (failedSources.length > 0) {
      console.log(
        `  WARNING: ${failedSources.length} sources failed in Pass 2`
      );
    }
    console.log(`  Resolved: ${resolved.length} leaves`);
  }

  if (nonLeaves.length > 0) {
    allMappings.push(...placeholderNonLeaves(nonLeaves));
    console.log(`  Non-leaves: ${nonLeaves.length} placeholders`);
  }

  const ordered = orderMappingsBySourceFile(allMappings, sourceCategories);
  const highCount = ordered.filter((m) => m.confidence >= 0.7).length;
  const lowCount = ordered.filter((m) => m.confidence < 0.5).length;

  const output = {
    ebayCategory: category,
    totalMapped: ordered.length,
    highConfidence: highCount,
    lowConfidence: lowCount,
    mappings: ordered,
  };

  await writeFile(outputPath, JSON.stringify(output, null, 2));

  const highPct =
    ordered.length > 0 ? ((highCount / ordered.length) * 100).toFixed(0) : "0";
  console.log(
    `  -> ${slug}.json (${highPct}% high confidence, ${lowCount} low)\n`
  );

  return ordered.length;
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<number>
): Promise<number> {
  let total = 0;
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < items.length) {
      const item = items[idx++];
      if (item !== undefined) {
        total += await fn(item);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return total;
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

async function consolidate(
  perCategoryDir: string,
  finalPath: string
): Promise<void> {
  const files = (await readdir(perCategoryDir)).filter((f) =>
    f.endsWith(".json")
  );
  const flat: Record<string, string> = {};
  for (const file of files) {
    const content = await readFile(join(perCategoryDir, file), "utf-8");
    const data = JSON.parse(content) as { mappings: MappingEntry[] };
    for (const m of data.mappings) {
      if (m.mappingSource !== "unmapped" && m.mappingSource !== "skipped") {
        flat[m.ebayId] = m.shopifyCategoryId;
      }
    }
  }
  await writeFile(finalPath, JSON.stringify(flat, null, 2));
  console.log(
    `\nConsolidated ${Object.keys(flat).length} mappings -> ${finalPath}`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error(
    "Set OPENAI_API_KEY environment variable.\n" +
      "Usage: OPENAI_API_KEY=sk-... bun run packages/taxonomy/scripts/map-ebay-to-shopify-v2.ts"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const categoryFilter = args.includes("--category")
  ? args[args.indexOf("--category") + 1]
  : null;
const resume = args.includes("--resume");
const maxTargetsArg = args.includes("--max-targets")
  ? Number.parseInt(args[args.indexOf("--max-targets") + 1] ?? "", 10)
  : Number.NaN;
const maxTargets = Number.isNaN(maxTargetsArg)
  ? DEFAULT_MAX_TARGETS
  : maxTargetsArg;

const client = new OpenAI({ apiKey });

// Resolve version and compute paths
const ebayVersion = await resolveEbayVersion();
const EBAY_CATS_DIR = join(EBAY_INTEGRATIONS_DIR, ebayVersion, "categories");
const EBAY_MAPPINGS_DIR = join(EBAY_INTEGRATIONS_DIR, ebayVersion, "mappings");
const PER_CATEGORY_DIR = join(EBAY_MAPPINGS_DIR, "categories");
const FINAL_MAPPING_PATH = join(EBAY_MAPPINGS_DIR, "mappings.json");

console.log(`Using eBay version: ${ebayVersion}`);
console.log(`Max targets per batch: ${maxTargets}`);
console.log(`Model: ${MODEL}`);

// Load Shopify data (once)
console.log("\nLoading Shopify leaf fullnames...");
await mkdir(PER_CATEGORY_DIR, { recursive: true });
const allShopifyFullnames = await loadAllShopifyLeafFullnames();
const shopifyFNtoId = await buildShopifyFullnameToId();
console.log(`  ${allShopifyFullnames.length} Shopify leaf categories loaded`);

// Iterate per-vertical source files
const sourceFiles = (await readdir(EBAY_CATS_DIR))
  .filter((f) => f.endsWith(".json") && f !== "categories.json")
  .sort();

console.log(
  `\nProcessing ${sourceFiles.length} verticals (concurrency: ${CONCURRENCY})...\n`
);

const ctx: SharedContext = {
  allShopifyFullnames,
  client,
  maxTargets,
  shopifyFNtoId,
};

const paths = {
  ebayBatsDir: EBAY_CATS_DIR,
  perCategoryDir: PER_CATEGORY_DIR,
};

const totalMapped = await runWithConcurrency(
  sourceFiles,
  CONCURRENCY,
  (sourceFile) =>
    processCategory(sourceFile, paths, ctx, {
      categoryFilter: categoryFilter ?? null,
      resume,
    })
);

// Consolidate into flat lookup (skip for single-vertical runs)
if (!categoryFilter) {
  await consolidate(PER_CATEGORY_DIR, FINAL_MAPPING_PATH);
}

console.log(`\nDone. Total entries: ${totalMapped}`);
