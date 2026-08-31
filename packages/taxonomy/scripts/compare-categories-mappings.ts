/**
 * Compare eBay categories vs mappings and generate a Markdown report.
 *
 * For each per-vertical JSON file, compares totalCategories (from categories/)
 * against totalMapped (from mappings/categories/) and flags discrepancies.
 *
 * Usage:
 *   bun run packages/taxonomy/scripts/compare-categories-mappings.ts
 *
 * Options:
 *   --version <num>   eBay category tree version (default: latest found)
 *
 * Output:
 *   data/integrations/ebay/{version}/mappings/comparison-report.md
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dir, "../data");
const EBAY_INTEGRATIONS_DIR = join(DATA_DIR, "integrations/ebay");
const VERSION_RE = /^\d+$/;

interface CategoryFile {
  categories: unknown[];
  leaves: number;
  totalCategories: number;
  vertical: string;
}

interface MappingEntry {
  mappingSource: string;
}

interface MappingFile {
  ebayCategory: string;
  highConfidence: number;
  lowConfidence: number;
  mappings: MappingEntry[];
  shopifyCategories: unknown[];
  totalMapped: number;
}

interface FileReport {
  diff: number | null;
  file: string;
  highConfidence: number | null;
  issue: string | null;
  leaves: number;
  lowConfidence: number | null;
  match: boolean;
  totalCategories: number;
  totalMapped: number | null;
  unmapped: number | null;
}

async function getLatestVersion(): Promise<string> {
  const entries = await readdir(EBAY_INTEGRATIONS_DIR);
  const versions = entries
    .filter((e) => VERSION_RE.test(e))
    .sort((a, b) => Number(b) - Number(a));
  const latest = versions[0];
  if (!latest) {
    throw new Error("No eBay category versions found");
  }
  return latest;
}

function parseArgs(): { version?: string } {
  const args = process.argv.slice(2);
  const opts: { version?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--version" && args[i + 1]) {
      opts.version = args[i + 1];
      i++;
    }
  }
  return opts;
}

function fmt(n: number | null): string {
  if (n === null) {
    return "-";
  }
  return n.toLocaleString("en-US");
}

interface Totals {
  cats: number;
  high: number;
  leaves: number;
  low: number;
  mapped: number;
  matched: number;
  mismatched: number;
  missing: number;
  unmapped: number;
}

async function collectReports(
  categoriesDir: string,
  mappingsDir: string,
  categoryFiles: string[]
): Promise<{ files: FileReport[]; totals: Totals }> {
  const files: FileReport[] = [];
  const totals: Totals = {
    cats: 0,
    leaves: 0,
    mapped: 0,
    high: 0,
    low: 0,
    unmapped: 0,
    matched: 0,
    mismatched: 0,
    missing: 0,
  };

  for (const fname of categoryFiles) {
    const catData: CategoryFile = JSON.parse(
      await readFile(join(categoriesDir, fname), "utf-8")
    );
    const cats = catData.totalCategories ?? 0;
    const leaves = catData.leaves ?? 0;

    totals.cats += cats;
    totals.leaves += leaves;

    const mapPath = join(mappingsDir, fname);
    if (!existsSync(mapPath)) {
      totals.missing++;
      totals.mismatched++;
      files.push({
        file: fname,
        totalCategories: cats,
        leaves,
        totalMapped: null,
        highConfidence: null,
        lowConfidence: null,
        unmapped: null,
        match: false,
        diff: null,
        issue: "No mapping file",
      });
      continue;
    }

    const mapData: MappingFile = JSON.parse(await readFile(mapPath, "utf-8"));
    const mapped = mapData.totalMapped;
    const high = mapData.highConfidence;
    const low = mapData.lowConfidence;
    const unmapped = mapData.mappings.filter(
      (m) => m.mappingSource === "unmapped"
    ).length;

    totals.mapped += mapped;
    totals.high += high;
    totals.low += low;
    totals.unmapped += unmapped;

    const isMatch = cats === mapped;
    if (isMatch) {
      totals.matched++;
    } else {
      totals.mismatched++;
    }

    files.push({
      file: fname,
      totalCategories: cats,
      leaves,
      totalMapped: mapped,
      highConfidence: high,
      lowConfidence: low,
      unmapped,
      match: isMatch,
      diff: isMatch ? null : cats - mapped,
      issue: isMatch ? null : `Off by ${Math.abs(cats - mapped)}`,
    });
  }

  return { files, totals };
}

function buildMarkdown(
  version: string,
  files: FileReport[],
  totals: Totals,
  totalFiles: number
): string {
  const lines: string[] = [];
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  lines.push(`# eBay Categories vs Mappings — Version ${version}`);
  lines.push("");
  lines.push(`Generated: ${now}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | ---: |");
  lines.push(`| Total files | ${totalFiles} |`);
  lines.push(`| Matched | ${totals.matched} |`);
  lines.push(`| Mismatched | ${totals.mismatched} |`);
  lines.push(`| Missing mapping files | ${totals.missing} |`);
  lines.push(`| Total categories | ${fmt(totals.cats)} |`);
  lines.push(`| Total leaves | ${fmt(totals.leaves)} |`);
  lines.push(`| Total mapped | ${fmt(totals.mapped)} |`);
  lines.push(`| High confidence | ${fmt(totals.high)} |`);
  lines.push(`| Low confidence | ${fmt(totals.low)} |`);
  lines.push(`| Unmapped | ${fmt(totals.unmapped)} |`);
  lines.push("");

  const mismatches = files.filter((f) => !f.match);
  if (mismatches.length > 0) {
    lines.push("## Mismatches");
    lines.push("");
    lines.push("| File | Categories | Mapped | Diff | Issue |");
    lines.push("| --- | ---: | ---: | ---: | --- |");
    for (const m of mismatches) {
      lines.push(
        `| ${m.file} | ${fmt(m.totalCategories)} | ${fmt(m.totalMapped)} | ${m.diff === null ? "-" : fmt(m.diff)} | ${m.issue} |`
      );
    }
    lines.push("");
  }

  lines.push("## Side-by-Side Comparison");
  lines.push("");
  lines.push(
    "| # | File | Total Cats | Leaves | Total Mapped | High Conf | Low Conf | Unmapped | Status |"
  );
  lines.push("| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |");

  let row = 0;
  for (const f of files) {
    row++;
    const status = f.match ? "OK" : `**MISMATCH** (${f.issue})`;
    lines.push(
      `| ${row} | ${f.file} | ${fmt(f.totalCategories)} | ${fmt(f.leaves)} | ${fmt(f.totalMapped)} | ${fmt(f.highConfidence)} | ${fmt(f.lowConfidence)} | ${fmt(f.unmapped)} | ${status} |`
    );
  }

  lines.push(
    `| | **TOTALS** | **${fmt(totals.cats)}** | **${fmt(totals.leaves)}** | **${fmt(totals.mapped)}** | **${fmt(totals.high)}** | **${fmt(totals.low)}** | **${fmt(totals.unmapped)}** | |`
  );
  lines.push("");

  return lines.join("\n");
}

async function run() {
  const opts = parseArgs();
  const version = opts.version ?? (await getLatestVersion());
  const versionDir = join(EBAY_INTEGRATIONS_DIR, version);
  const categoriesDir = join(versionDir, "categories");
  const mappingsDir = join(versionDir, "mappings/categories");

  if (!existsSync(categoriesDir)) {
    throw new Error(`Categories directory not found: ${categoriesDir}`);
  }

  const categoryFiles = (await readdir(categoriesDir))
    .filter((f) => f.endsWith(".json") && f !== "categories.json")
    .sort();

  const { files, totals } = await collectReports(
    categoriesDir,
    mappingsDir,
    categoryFiles
  );

  const md = buildMarkdown(version, files, totals, categoryFiles.length);

  const outputDir = join(versionDir, "mappings");
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, "comparison-report.md");
  await writeFile(outputPath, md);

  console.log(md);
  console.log(`\nReport saved to: ${outputPath}`);
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
