#!/usr/bin/env bun
/**
 * Validates `.domain/` rule files and the traceability between them, the code
 * they cite, and the tests that prove them.
 *
 * Run: bun .github/scripts/check-domain.ts
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DOMAIN_PREFIXES as PREFIXES } from "./domain-guards";

const DOMAIN_DIR = ".domain";
const DECISIONS_DIR = join(DOMAIN_DIR, "decisions");
const SCAN_ROOTS = ["apps", "packages"];
const SCAN_EXTENSIONS = [".ts", ".tsx"];

const SEVERITIES = new Set(["critical", "high", "medium"]);
const STATUSES = new Set(["enforced", "advisory", "proposed", "retired"]);

const RULE_ID = /^[A-Z]{3}-\d{3}$/;
const HEADING = /^### ([A-Z]{3}-\d{3}) — (.+)$/gm;
const YAML_BLOCK = /```yaml\n([\s\S]*?)```/g;
/** A rule ID mentioned in source code, e.g. `// INV-003: bounds, not a point` */
const CODE_REFERENCE = /\b([A-Z]{3}-\d{3})\b/g;

/** Flat-YAML shapes the rule blocks use: `  - item`, `key: value`, `# trailing`. */
const YAML_LIST_ITEM = /^\s+- (.+)$/;
const YAML_PAIR = /^(\w+):\s*(.*)$/;
const YAML_TRAILING_COMMENT = /\s*#.*$/;
/** `decisions/0002-outbox-for-marketplace-writes.md` -> `0002` */
const ADR_FILENAME = /^(\d{4})-/;

interface Rule {
  adr: string | null;
  code: string[];
  file: string;
  id: string;
  severity: string;
  status: string;
  tests: string[];
  title: string;
}

const errors: string[] = [];
const warnings: string[] = [];

const fail = (file: string, message: string) =>
  errors.push(`${file}: ${message}`);
const warn = (file: string, message: string) =>
  warnings.push(`${file}: ${message}`);

/** Minimal parser for the flat subset of YAML the rule blocks use. */
function parseBlock(raw: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  let listKey: string | null = null;

  for (const line of raw.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }

    const item = line.match(YAML_LIST_ITEM);
    if (item && listKey) {
      (out[listKey] as string[]).push(item[1].trim());
      continue;
    }

    const pair = line.match(YAML_PAIR);
    if (!pair) {
      continue;
    }

    const [, key, value] = pair;
    const trimmed = value.trim();
    if (trimmed === "") {
      listKey = key;
      out[key] = [];
    } else if (trimmed === "[]") {
      listKey = null;
      out[key] = [];
    } else {
      listKey = null;
      out[key] = trimmed.replace(YAML_TRAILING_COMMENT, "").trim();
    }
  }
  return out;
}

/** An id must match its heading, be well-formed, and carry the domain's prefix. */
function validId(
  file: string,
  prefix: string,
  headingId: string,
  id: string
): boolean {
  if (id !== headingId) {
    fail(file, `heading ${headingId} declares id "${id}" — they must match`);
    return false;
  }
  if (!RULE_ID.test(id)) {
    fail(file, `"${id}" is not a valid rule id (expected e.g. ${prefix}-001)`);
    return false;
  }
  if (!id.startsWith(`${prefix}-`)) {
    fail(file, `${id} does not use this domain's prefix "${prefix}"`);
    return false;
  }
  return true;
}

/** One heading plus its yaml block. Null when the id is unusable downstream. */
function parseRule(
  file: string,
  prefix: string,
  heading: RegExpMatchArray,
  block: RegExpMatchArray
): Rule | null {
  const [, headingId, title] = heading;
  const meta = parseBlock(block[1]);
  const id = typeof meta.id === "string" ? meta.id : "";

  if (!validId(file, prefix, headingId, id)) {
    return null;
  }

  const severity = String(meta.severity ?? "");
  const status = String(meta.status ?? "");
  if (!SEVERITIES.has(severity)) {
    fail(
      file,
      `${id}: severity "${severity}" is not one of ${[...SEVERITIES].join(" | ")}`
    );
  }
  if (!STATUSES.has(status)) {
    fail(
      file,
      `${id}: status "${status}" is not one of ${[...STATUSES].join(" | ")}`
    );
  }

  return {
    id,
    title,
    file,
    severity,
    status,
    adr: typeof meta.adr === "string" ? meta.adr : null,
    code: Array.isArray(meta.code) ? meta.code : [],
    tests: Array.isArray(meta.tests) ? meta.tests : [],
  };
}

function collectRules(): Rule[] {
  const rules: Rule[] = [];

  for (const [domain, prefix] of Object.entries(PREFIXES)) {
    const file = join(DOMAIN_DIR, domain, "rules.md");
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      fail(file, "missing — every bounded context needs a rules.md");
      continue;
    }

    const headings = [...source.matchAll(HEADING)];
    const blocks = [...source.matchAll(YAML_BLOCK)];

    if (headings.length !== blocks.length) {
      fail(
        file,
        `${headings.length} rule headings but ${blocks.length} yaml blocks — each rule needs exactly one`
      );
      continue;
    }

    for (const [i, heading] of headings.entries()) {
      const rule = parseRule(file, prefix, heading, blocks[i]);
      if (rule) {
        rules.push(rule);
      }
    }
  }

  return rules;
}

function checkRule(rule: Rule, adrNumbers: Set<string>) {
  const { file, id } = rule;

  if (rule.adr && !adrNumbers.has(rule.adr.padStart(4, "0"))) {
    fail(
      file,
      `${id}: adr ${rule.adr} has no matching file in ${DECISIONS_DIR}/`
    );
  }

  for (const path of [...rule.code, ...rule.tests]) {
    try {
      statSync(path);
    } catch {
      fail(file, `${id}: cited path does not exist — ${path}`);
    }
  }

  if (rule.status === "retired") {
    return;
  }

  if (rule.status === "proposed") {
    if (rule.code.length > 0) {
      warn(
        file,
        `${id}: status is "proposed" but cites code — promote it to "enforced"?`
      );
    }
    return;
  }

  if (rule.code.length === 0) {
    fail(
      file,
      `${id}: status "${rule.status}" requires at least one code path`
    );
  }

  if (
    rule.severity === "critical" &&
    rule.status === "enforced" &&
    rule.tests.length === 0
  ) {
    fail(
      file,
      `${id}: critical + enforced requires at least one test. Downgrade to "advisory" if it genuinely cannot be tested.`
    );
  }

  if (rule.tests.length === 0 && rule.status === "enforced") {
    warn(
      file,
      `${id}: enforced with no test — nothing would fail if this broke`
    );
  }
}

function* walk(
  dir: string,
  extensions: string[] = SCAN_EXTENSIONS
): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules") {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path, extensions);
    } else if (extensions.some((ext) => path.endsWith(ext))) {
      yield path;
    }
  }
}

/** Every rule id mentioned in source must exist — catches renamed or deleted rules. */
function checkCodeReferences(known: Set<string>) {
  for (const root of SCAN_ROOTS) {
    for (const path of walk(root)) {
      const source = readFileSync(path, "utf8");
      for (const [, id] of source.matchAll(CODE_REFERENCE)) {
        if (!known.has(id)) {
          fail(relative(".", path), `references unknown rule ${id}`);
        }
      }
    }
  }
}

/**
 * Every rule id cited in prose must resolve — glossary pointers, skills, and the
 * entry-point files included. `.agents/` skills cite rules now, so a renamed or
 * retired rule has to fail there too, not only in `.domain/`.
 */
const PROSE_ROOTS = [
  DOMAIN_DIR,
  ".agents",
  "AGENTS.md",
  "CLAUDE.md",
  ".claude/CLAUDE.md",
];

function proseFiles(): string[] {
  const files: string[] = [];
  for (const root of PROSE_ROOTS) {
    if (root.endsWith(".md")) {
      try {
        statSync(root);
        files.push(root);
      } catch {
        // optional entry point
      }
    } else {
      files.push(...walk(root, [".md"]));
    }
  }
  return files;
}

function checkDomainReferences(known: Set<string>) {
  for (const file of proseFiles()) {
    if (file.includes("_template")) {
      continue;
    }
    const prose = readFileSync(file, "utf8").replace(YAML_BLOCK, "");
    for (const [, id] of prose.matchAll(CODE_REFERENCE)) {
      if (!known.has(id)) {
        fail(file, `references unknown rule ${id}`);
      }
    }
  }
}

function main() {
  let adrNumbers: Set<string>;
  try {
    adrNumbers = new Set(
      readdirSync(DECISIONS_DIR)
        .map((f) => f.match(ADR_FILENAME)?.[1])
        .filter((n): n is string => Boolean(n))
    );
  } catch {
    console.error(`✗ ${DECISIONS_DIR}/ not found`);
    process.exit(1);
  }

  const rules = collectRules();

  const seen = new Map<string, string>();
  for (const rule of rules) {
    const previous = seen.get(rule.id);
    if (previous) {
      fail(rule.file, `duplicate rule id ${rule.id} (also in ${previous})`);
    } else {
      seen.set(rule.id, rule.file);
    }
  }

  const known = new Set(rules.map((r) => r.id));
  for (const rule of rules) {
    checkRule(rule, adrNumbers);
  }
  checkDomainReferences(known);
  checkCodeReferences(known);

  const byStatus = (status: string) =>
    rules.filter((r) => r.status === status).length;
  console.log(
    `${rules.length} rules across ${Object.keys(PREFIXES).length} domains ` +
      `— ${byStatus("enforced")} enforced, ${byStatus("advisory")} advisory, ${byStatus("proposed")} proposed`
  );

  for (const warning of warnings) {
    console.log(`  warn  ${warning}`);
  }

  if (errors.length > 0) {
    console.error(
      `\n✗ ${errors.length} problem${errors.length === 1 ? "" : "s"}:`
    );
    for (const error of errors) {
      console.error(`  ${error}`);
    }
    process.exit(1);
  }

  console.log("✓ domain rules valid");
}

main();
