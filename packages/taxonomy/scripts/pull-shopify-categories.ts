/**
 * Extract slim Shopify taxonomy from the full product-taxonomy repo.
 * Splits output by vertical (one file per top-level category), matching
 * Shopify's source structure.
 *
 * Usage:
 *   bun run packages/taxonomy/scripts/pull-shopify-categories.ts
 *   bun run packages/taxonomy/scripts/pull-shopify-categories.ts --repo-path <path-to-product-taxonomy-repo>
 *
 * If --repo-path is not provided, the script fetches the latest release tag
 * from GitHub, clones into a cache directory, and reuses it on subsequent runs
 * if the tag hasn't changed.
 *
 * Input:  <repo>/dist/en/categories.json (62MB)
 * Output: packages/taxonomy/data/shopify/<prefix>_<name>.json (~150-300KB each)
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface RawCategory {
  ancestors: unknown;
  attributes: unknown;
  children: { id: string; name: string }[];
  full_name: string;
  id: string;
  level: number;
  name: string;
  parent_id: string | null;
  return_reasons: unknown;
}

interface RawVertical {
  categories: RawCategory[];
  name: string;
  prefix: string;
}

interface RawTaxonomy {
  version: string;
  verticals: RawVertical[];
}

interface CategorySlim {
  children: { id: string; name: string }[];
  full_name: string;
  id: string;
  level: number;
  name: string;
  parent_id: string | null;
}

const GID_PREFIX = "gid://shopify/TaxonomyCategory/";

const stripGid = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }
  return value.startsWith(GID_PREFIX) ? value.slice(GID_PREFIX.length) : value;
};

const toSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[&]/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");

const CACHE_DIR = join(tmpdir(), "shopify-taxonomy-cache");
const REPO_URL = "https://github.com/Shopify/product-taxonomy.git";

const parseRepoPath = (): string | undefined => {
  const flagIndex = process.argv.indexOf("--repo-path");
  if (flagIndex === -1) {
    return undefined;
  }
  const value = process.argv[flagIndex + 1];
  if (!value) {
    console.error("Error: --repo-path requires a path argument");
    process.exit(1);
  }
  return value;
};

const getLatestTag = async (): Promise<string> => {
  const response = await fetch(
    "https://api.github.com/repos/Shopify/product-taxonomy/releases/latest",
    { headers: { Accept: "application/vnd.github+json" } }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch latest release (${response.status}): ${await response.text()}`
    );
  }
  const data = (await response.json()) as { tag_name: string };
  return data.tag_name;
};

const getCachedTag = (): string | null => {
  if (!existsSync(CACHE_DIR)) {
    return null;
  }
  try {
    return execSync("git describe --tags --exact-match HEAD 2>/dev/null", {
      cwd: CACHE_DIR,
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
};

const ensureRepo = async (): Promise<string> => {
  const latestTag = await getLatestTag();
  const cachedTag = getCachedTag();

  if (cachedTag === latestTag) {
    console.log(`Using cached repo at ${CACHE_DIR} (${latestTag})`);
    return CACHE_DIR;
  }

  if (cachedTag) {
    console.log(`Updating cache: ${cachedTag} → ${latestTag}`);
    execSync("git fetch --tags origin", { cwd: CACHE_DIR, stdio: "inherit" });
    execSync(`git checkout ${latestTag}`, {
      cwd: CACHE_DIR,
      stdio: "inherit",
    });
  } else {
    console.log(`Cloning Shopify product-taxonomy (${latestTag})...`);
    await mkdir(CACHE_DIR, { recursive: true });
    execSync(
      `git clone --depth 1 --branch ${latestTag} ${REPO_URL} "${CACHE_DIR}"`,
      { stdio: "inherit" }
    );
  }

  return CACHE_DIR;
};

const explicitPath = parseRepoPath();
const repoPath = explicitPath ?? (await ensureRepo());

const inputPath = join(repoPath, "dist/en/categories.json");
const outputDir = join(import.meta.dir, "../data/categories");

// biome-ignore lint/correctness/noUndeclaredVariables: Bun global
const raw: RawTaxonomy = await Bun.file(inputPath).json();

await mkdir(outputDir, { recursive: true });

let totalCategories = 0;

for (const vertical of raw.verticals) {
  const categories: CategorySlim[] = vertical.categories.map((cat) => ({
    id: stripGid(cat.id) as string,
    level: cat.level,
    name: cat.name,
    full_name: cat.full_name,
    parent_id: stripGid(cat.parent_id),
    children: cat.children.map((child) => ({
      id: stripGid(child.id) as string,
      name: child.name,
    })),
  }));

  const fileName = `${vertical.prefix}_${toSlug(vertical.name)}.json`;
  const outputPath = join(outputDir, fileName);
  const output = `${JSON.stringify({ version: raw.version, categories }, null, 2)}\n`;

  // biome-ignore lint/correctness/noUndeclaredVariables: Bun global
  await Bun.write(outputPath, output);

  totalCategories += categories.length;
  const sizeKB = (new Blob([output]).size / 1024).toFixed(0);
  console.log(`  ${fileName} — ${categories.length} categories (${sizeKB} KB)`);
}

console.log(`\nVersion: ${raw.version}`);
console.log(`Total categories: ${totalCategories}`);
console.log(`Verticals: ${raw.verticals.length}`);
console.log(`Output: ${outputDir}/`);
