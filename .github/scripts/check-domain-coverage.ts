#!/usr/bin/env bun
/**
 * Enforces that changes to guarded code arrive with domain traceability.
 *
 * A diff touching a guarded path must do one of:
 *   1. change that domain's `.domain/<domain>/rules.md`, or
 *   2. reference one of that domain's rule ids somewhere in the diff, or
 *   3. carry a `Domain-Check: skip <reason>` trailer in a commit message.
 *
 * Run: bun .github/scripts/check-domain-coverage.ts [baseRef]   (default origin/main)
 */

import { execFileSync } from "node:child_process";
import { GUARDED } from "./domain-guards";

const SKIP_TRAILER = /^Domain-Check:\s*skip\s+(.+)$/im;

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function resolveBase(requested: string): string | null {
  for (const ref of [requested, "origin/main", "main"]) {
    try {
      return git("merge-base", "HEAD", ref).trim();
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function main() {
  const base = resolveBase(process.argv[2] ?? "origin/main");
  if (!base) {
    console.log("· no base ref available — skipping coverage check");
    return;
  }

  // Committed work plus anything still in the working tree, so a local
  // pre-commit run sees the same picture CI will after the commit lands.
  const changed = [
    ...git("diff", "--name-only", `${base}...HEAD`).split("\n"),
    // -uall so wholly-new directories list their files instead of collapsing.
    ...git("status", "--porcelain", "-uall")
      .split("\n")
      .map((line) => line.slice(3).split(" -> ").pop() ?? ""),
  ].filter(Boolean);

  if (changed.length === 0) {
    console.log("· no changes");
    return;
  }

  const commitMessages = git("log", "--format=%B", `${base}..HEAD`);
  const skip = commitMessages.match(SKIP_TRAILER);
  if (skip) {
    console.log(`· skipped by trailer: ${skip[1].trim()}`);
    return;
  }

  const triggered = new Map<string, string>();
  for (const file of changed) {
    const guard = GUARDED.find((g) => g.match.test(file));
    if (guard) {
      triggered.set(guard.domain, guard.prefix);
    }
  }

  if (triggered.size === 0) {
    console.log("· no guarded paths touched");
    return;
  }

  const diff = git("diff", `${base}...HEAD`) + git("diff", "HEAD");
  const problems: string[] = [];

  for (const [domain, prefix] of triggered) {
    const rulesFile = `.domain/${domain}/rules.md`;
    if (changed.includes(rulesFile)) {
      continue;
    }

    const referenced =
      new RegExp(`\\b${prefix}-\\d{3}\\b`).test(diff) ||
      new RegExp(`\\b${prefix}-\\d{3}\\b`).test(commitMessages);
    if (referenced) {
      continue;
    }

    problems.push(
      `  ${domain}: guarded code changed with no ${prefix}-NNN reference and no change to ${rulesFile}`
    );
  }

  if (problems.length > 0) {
    console.error(`✗ domain coverage:\n${problems.join("\n")}`);
    console.error(
      "\nResolve by one of:\n" +
        "  · update the rule if this changes behaviour the rule describes\n" +
        "  · cite the rule id in a code comment — e.g. `// INV-003: bounds, not a point`\n" +
        "  · add a `Domain-Check: skip <reason>` trailer to a commit if genuinely unrelated\n"
    );
    process.exit(1);
  }

  console.log(`✓ domain coverage (${[...triggered.keys()].join(", ")})`);
}

main();
