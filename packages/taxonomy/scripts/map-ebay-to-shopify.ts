/**
 * Map eBay categories to Shopify taxonomy using ChatGPT.
 *
 * Pipeline:
 *   Step 1 — Extract fullname arrays to temp files (idempotent)
 *   Step 2 — AI generates main category mapping, 1-to-many (cached)
 *   Step 3 — Build scoped target fullnames per eBay category
 *   Step 4 — AI maps source→target by fullname (no IDs, validated)
 *             + low-confidence retry against full Shopify catalog
 *   Step 5 — Resolve fullname pairs to eBay/Shopify IDs (deterministic)
 *   Step 6 — Order output to match source file category order
 *
 * Usage:
 *   bun run packages/taxonomy/scripts/map-ebay-to-shopify.ts
 *   (reads OPENAI_API_KEY from packages/taxonomy/scripts/.env)
 *
 * Options:
 *   --category <name>   Process only one category (e.g., "Consumer Electronics")
 *   --resume            Skip categories that already have mapping files
 *
 * Output: packages/taxonomy/data/integrations/ebay/{version}/mappings/
 *   categories/{slug}.json   per-category detail files
 *   mappings.json        flat lookup consumed by lookupCategory()
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config({ path: resolve(import.meta.dirname, ".env") });

const DATA_DIR = join(import.meta.dir, "../data");
const SHOPIFY_DIR = join(DATA_DIR, "categories");
const SHOPIFY_TEMP_DIR = join(SHOPIFY_DIR, "temp");
const EBAY_INTEGRATIONS_DIR = join(DATA_DIR, "integrations/ebay");
const BATCH_SIZE = 100;
const LOW_CONFIDENCE_THRESHOLD = 0.7;
const CONCURRENCY = 3;
const MODEL = "gpt-4.1-mini";
const JSON_ARRAY_RE = /\[[\s\S]*\]/;
const JSON_OBJECT_RE = /\{[\s\S]*\}/;

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

interface MainCategoryMapping {
  [ebayCategoryName: string]: string[];
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

// ---------------------------------------------------------------------------
// Step 1 — Extract fullname arrays to temp files
// ---------------------------------------------------------------------------

async function extractFullnames(ebayVersion: string): Promise<void> {
  const ebaySourceDir = join(EBAY_INTEGRATIONS_DIR, ebayVersion, "categories");
  const ebayTempDir = join(ebaySourceDir, "temp");
  await mkdir(ebayTempDir, { recursive: true });
  await mkdir(SHOPIFY_TEMP_DIR, { recursive: true });

  // Source (eBay) — per-vertical files, exclude categories.json
  const sourceFiles = (await readdir(ebaySourceDir)).filter(
    (f) => f.endsWith(".json") && f !== "categories.json"
  );
  let ebayNewCount = 0;
  for (const file of sourceFiles) {
    const slug = file.replace(".json", "");
    const outPath = join(ebayTempDir, `${slug}-fullnames.json`);
    if (existsSync(outPath)) {
      continue;
    }
    const content = await readFile(join(ebaySourceDir, file), "utf-8");
    const data = JSON.parse(content) as { categories: EbayCategory[] };
    const fullnames = data.categories.map((c) => c.fullName);
    await writeFile(outPath, JSON.stringify(fullnames, null, 2));
    ebayNewCount++;
  }
  console.log(
    `  eBay: ${sourceFiles.length} verticals (${ebayNewCount} new temp files)`
  );

  // Target (Shopify)
  let shopifyNewCount = 0;
  for (const [prefix, filename] of Object.entries(SHOPIFY_FILES)) {
    const outPath = join(SHOPIFY_TEMP_DIR, `${prefix}-fullnames.json`);
    if (existsSync(outPath)) {
      continue;
    }
    const content = await readFile(join(SHOPIFY_DIR, filename), "utf-8");
    const data = JSON.parse(content) as { categories: ShopifyCategory[] };
    // Leaves only — reduces target list size ~50%, AI should map to leaf categories
    const fullnames = data.categories
      .filter((c) => c.children.length === 0)
      .map((c) => c.full_name);
    await writeFile(outPath, JSON.stringify(fullnames, null, 2));
    shopifyNewCount++;
  }
  console.log(
    `  Shopify: ${Object.keys(SHOPIFY_FILES).length} verticals (${shopifyNewCount} new temp files)`
  );
}

// ---------------------------------------------------------------------------
// Step 2 — AI generates main category mapping (1-to-many, cached)
// ---------------------------------------------------------------------------

async function generateMainCategoryMapping(
  client: OpenAI,
  ebayVersion: string,
  mainCategoriesPath: string
): Promise<MainCategoryMapping> {
  if (existsSync(mainCategoriesPath)) {
    console.log("  Using cached main-categories.json");
    return JSON.parse(
      await readFile(mainCategoriesPath, "utf-8")
    ) as MainCategoryMapping;
  }

  // eBay top-level names (parentId === null)
  const combinedContent = await readFile(
    join(EBAY_INTEGRATIONS_DIR, ebayVersion, "categories/categories.json"),
    "utf-8"
  );
  const combinedData = JSON.parse(combinedContent) as {
    categories: EbayCategory[];
  };
  const ebayTopLevelNames = combinedData.categories
    .filter((c) => c.parentId === null)
    .map((c) => c.name);

  // Shopify root full_names (one per vertical file)
  const shopifyRoots: string[] = [];
  for (const filename of Object.values(SHOPIFY_FILES)) {
    const content = await readFile(join(SHOPIFY_DIR, filename), "utf-8");
    const data = JSON.parse(content) as { categories: ShopifyCategory[] };
    const root = data.categories.find((c) => c.parent_id === null);
    if (root) {
      shopifyRoots.push(root.full_name);
    }
  }
  const shopifyRootsSet = new Set(shopifyRoots);

  console.log(
    `  Calling AI: ${ebayTopLevelNames.length} eBay → ${shopifyRoots.length} Shopify verticals`
  );

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Map eBay marketplace verticals to Shopify taxonomy verticals.

EBAY VERTICALS (${ebayTopLevelNames.length} top-level category names):
${ebayTopLevelNames.join("\n")}

SHOPIFY VERTICALS (${shopifyRoots.length} top-level full_names):
${shopifyRoots.join("\n")}

Task: For each eBay vertical, list which Shopify verticals contain relevant products.
A single eBay vertical may map to multiple Shopify verticals (1-to-many allowed).

Rules:
- Values MUST be copied verbatim from the SHOPIFY VERTICALS list above
- Every eBay vertical must appear as a key
- Output ONLY a JSON object, no other text

JSON (keys = eBay vertical names, values = arrays of Shopify vertical full_name strings):`,
      },
    ],
  });

  const text = response.choices[0]?.message.content ?? "";
  const jsonMatch = text.match(JSON_OBJECT_RE);
  if (!jsonMatch) {
    throw new Error(
      `Failed to parse main category mapping response: ${text.slice(0, 200)}`
    );
  }

  const raw = JSON.parse(jsonMatch[0]) as Record<string, string[]>;

  // Validate values are known Shopify root full_names
  const result: MainCategoryMapping = {};
  for (const [ebayName, shopifyNames] of Object.entries(raw)) {
    const valid = shopifyNames.filter((n) => {
      if (shopifyRootsSet.has(n)) {
        return true;
      }
      console.warn(
        `  Warning: unknown Shopify root "${n}" for eBay vertical "${ebayName}" — skipping`
      );
      return false;
    });
    result[ebayName] = valid.length > 0 ? valid : ["Uncategorized"];
  }

  // Ensure every eBay top-level name is present
  for (const name of ebayTopLevelNames) {
    if (!result[name]) {
      console.warn(
        `  Warning: eBay vertical "${name}" missing from AI response — falling back to Uncategorized`
      );
      result[name] = ["Uncategorized"];
    }
  }

  await writeFile(mainCategoriesPath, JSON.stringify(result, null, 2));
  console.log("  Saved main-categories.json");
  return result;
}

// ---------------------------------------------------------------------------
// Step 3 — Build scoped target fullnames per eBay vertical
// ---------------------------------------------------------------------------

async function buildShopifyRootNameToPrefix(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const [prefix, filename] of Object.entries(SHOPIFY_FILES)) {
    const content = await readFile(join(SHOPIFY_DIR, filename), "utf-8");
    const data = JSON.parse(content) as { categories: ShopifyCategory[] };
    const root = data.categories.find((c) => c.parent_id === null);
    if (root) {
      map.set(root.full_name, prefix);
    }
  }
  return map;
}

async function buildAllShopifyFullnames(): Promise<string[]> {
  const all = new Set<string>();
  const files = (await readdir(SHOPIFY_TEMP_DIR)).filter((f) =>
    f.endsWith(".json")
  );
  for (const file of files) {
    const names = JSON.parse(
      await readFile(join(SHOPIFY_TEMP_DIR, file), "utf-8")
    ) as string[];
    for (const n of names) {
      all.add(n);
    }
  }
  return [...all];
}

async function buildTargetFullnamesForCategory(
  slug: string,
  categoryName: string,
  ebayTempDir: string,
  mainMapping: MainCategoryMapping,
  shopifyRootNameToPrefix: Map<string, string>
): Promise<string[]> {
  const outPath = join(ebayTempDir, `${slug}-target-fullnames.json`);
  if (existsSync(outPath)) {
    return JSON.parse(await readFile(outPath, "utf-8")) as string[];
  }

  const shopifyRootNames = mainMapping[categoryName] ?? ["Uncategorized"];
  const all = new Set<string>();

  for (const rootName of shopifyRootNames) {
    const prefix = shopifyRootNameToPrefix.get(rootName);
    if (!prefix) {
      console.warn(`  Warning: no prefix found for Shopify root "${rootName}"`);
      continue;
    }
    const tempPath = join(SHOPIFY_TEMP_DIR, `${prefix}-fullnames.json`);
    if (!existsSync(tempPath)) {
      console.warn(
        `  Warning: missing Shopify temp file for prefix "${prefix}"`
      );
      continue;
    }
    const names = JSON.parse(await readFile(tempPath, "utf-8")) as string[];
    for (const n of names) {
      all.add(n);
    }
  }

  const result = [...all];
  await writeFile(outPath, JSON.stringify(result, null, 2));
  return result;
}

// ---------------------------------------------------------------------------
// Step 4 — AI maps source→target by fullname (validated, no IDs)
// ---------------------------------------------------------------------------

async function mapFullnameBatch(
  client: OpenAI,
  sourceBatch: string[],
  targetFullnames: string[]
): Promise<{ entries: FullnameMappingEntry[]; missing: string[] }> {
  const sourceSet = new Set(sourceBatch);

  // Number the target list so the model returns an index instead of a string.
  // This prevents hallucinated paths that look valid but aren't in the input.
  const numberedTargets = targetFullnames
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
    const idx = entry.targetIndex - 1; // convert to 0-based
    if (idx < 0 || idx >= targetFullnames.length) {
      console.warn(
        `  Invalid targetIndex ${entry.targetIndex} (out of range 1-${targetFullnames.length}) for "${entry.source.slice(0, 60)}"`
      );
      continue;
    }
    entries.push({
      source: entry.source,
      // biome-ignore lint/style/noNonNullAssertion: idx is bounds-checked above
      target: targetFullnames[idx]!,
      confidence: entry.confidence,
    });
    returnedSources.add(entry.source);
  }

  const missing = sourceBatch.filter((s) => !returnedSources.has(s));
  return { entries, missing };
}

async function mapByFullname(
  client: OpenAI,
  sourceFullnames: string[],
  targetFullnames: string[]
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
    process.stdout.write(`  Batch ${batchNum}/${totalBatches}...`);

    try {
      const { entries, missing } = await mapFullnameBatch(
        client,
        batch,
        targetFullnames
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

async function retryLowConfidence(
  client: OpenAI,
  lowConfidenceEntries: FullnameMappingEntry[],
  missingSources: string[],
  allShopifyFullnames: string[],
  existingMappings: Map<string, FullnameMappingEntry>
): Promise<Map<string, FullnameMappingEntry>> {
  const retrySources = [
    ...new Set([
      ...lowConfidenceEntries.map((e) => e.source),
      ...missingSources,
    ]),
  ];

  if (retrySources.length === 0) {
    return existingMappings;
  }

  console.log(
    `  Retrying ${retrySources.length} low-confidence/missing against full Shopify catalog...`
  );

  const { mappings: retryMappings } = await mapByFullname(
    client,
    retrySources,
    allShopifyFullnames
  );

  const merged = new Map(existingMappings);
  for (const [source, entry] of retryMappings) {
    merged.set(source, entry);
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Step 5 — Resolve fullname pairs to IDs
// ---------------------------------------------------------------------------

function buildEbayFullnameToId(
  categories: EbayCategory[]
): Map<string, string> {
  return new Map(categories.map((c) => [c.fullName, c.id]));
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

// Non-leaf categories are not AI-mapped — placeholder entries keep the output
// complete so every eBay ID is accounted for. Excluded from mappings.json.
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

// ---------------------------------------------------------------------------
// Step 6 — Order output to match source file category order
// ---------------------------------------------------------------------------

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
// ---------------------------------------------------------------------------
// Per-category processing (called in parallel)
// ---------------------------------------------------------------------------

interface SharedContext {
  allShopifyFullnames: string[];
  client: OpenAI;
  mainMapping: MainCategoryMapping;
  shopifyFNtoId: Map<string, string>;
  shopifyRootNameToPrefix: Map<string, string>;
}

async function processCategory(
  sourceFile: string,
  paths: {
    ebayBatsDir: string;
    ebayBatsTempDir: string;
    perCategoryDir: string;
  },
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

  const leaves = sourceCategories.filter((c) => c.leaf);
  const nonLeaves = sourceCategories.filter((c) => !c.leaf);
  const shopifyRootNames = ctx.mainMapping[category] ?? ["Uncategorized"];

  console.log(`\n[${category}]`);
  console.log(`  Shopify categories: [${shopifyRootNames.join(", ")}]`);

  const targetFullnames = await buildTargetFullnamesForCategory(
    slug,
    category,
    paths.ebayBatsTempDir,
    ctx.mainMapping,
    ctx.shopifyRootNameToPrefix
  );
  console.log(
    `  ${leaves.length} leaves, ${nonLeaves.length} non-leaves | ${targetFullnames.length} Shopify targets`
  );

  const allMappings: MappingEntry[] = [];

  if (leaves.length > 0) {
    const leafFullnames = leaves.map((c) => c.fullName);
    console.log(
      `  Phase A: ${leaves.length} leaves (${Math.ceil(leaves.length / BATCH_SIZE)} batches)`
    );

    const { mappings: initialMappings, missingSources } = await mapByFullname(
      ctx.client,
      leafFullnames,
      targetFullnames
    );

    const lowConfidence = [...initialMappings.values()].filter(
      (e) => e.confidence < LOW_CONFIDENCE_THRESHOLD
    );
    const mergedMappings = await retryLowConfidence(
      ctx.client,
      lowConfidence,
      missingSources,
      ctx.allShopifyFullnames,
      initialMappings
    );

    const ebayFNtoId = buildEbayFullnameToId(sourceCategories);
    const resolved = resolveIds(mergedMappings, ebayFNtoId, ctx.shopifyFNtoId);
    allMappings.push(...resolved);
    console.log(`  Phase A: ${resolved.length} leaves resolved`);
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
    shopifyCategories: shopifyRootNames,
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
// Consolidation — merge per-vertical files into flat lookup
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
      "Usage: OPENAI_API_KEY=sk-... bun run packages/taxonomy/scripts/map-ebay-to-shopify.ts"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const categoryFilter = args.includes("--category")
  ? args[args.indexOf("--category") + 1]
  : null;
const resume = args.includes("--resume");

const client = new OpenAI({ apiKey });

// Resolve version and compute paths
const ebayVersion = await resolveEbayVersion();
const EBAY_CATS_DIR = join(EBAY_INTEGRATIONS_DIR, ebayVersion, "categories");
const EBAY_CATS_TEMP_DIR = join(EBAY_CATS_DIR, "temp");
const EBAY_MAPPINGS_DIR = join(EBAY_INTEGRATIONS_DIR, ebayVersion, "mappings");
const MAIN_CATEGORIES_PATH = join(EBAY_MAPPINGS_DIR, "main-categories.json");
const PER_CATEGORY_DIR = join(EBAY_MAPPINGS_DIR, "categories");
const FINAL_MAPPING_PATH = join(EBAY_MAPPINGS_DIR, "mappings.json");

console.log(`Using eBay version: ${ebayVersion}`);

// Step 1
console.log("\nStep 1: Extracting fullname arrays...");
await mkdir(PER_CATEGORY_DIR, { recursive: true });
await extractFullnames(ebayVersion);

// Step 2
console.log("\nStep 2: Main category mapping...");
await mkdir(EBAY_MAPPINGS_DIR, { recursive: true });
const mainMapping = await generateMainCategoryMapping(
  client,
  ebayVersion,
  MAIN_CATEGORIES_PATH
);

// Shared helpers (built once, used across all verticals)
console.log("\nPreparing shared helpers...");
const shopifyRootNameToPrefix = await buildShopifyRootNameToPrefix();
const shopifyFNtoId = await buildShopifyFullnameToId();
const allShopifyFullnames = await buildAllShopifyFullnames();

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
  mainMapping,
  shopifyFNtoId,
  shopifyRootNameToPrefix,
};

const paths = {
  ebayBatsDir: EBAY_CATS_DIR,
  ebayBatsTempDir: EBAY_CATS_TEMP_DIR,
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
