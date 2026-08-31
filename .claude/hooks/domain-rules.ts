#!/usr/bin/env bun
/**
 * PreToolUse hook: when an edit targets domain-guarded code, surface the rules
 * that govern it before the edit is written.
 *
 * CLAUDE.md tells the agent guarded paths exist. This makes it unavoidable —
 * the invariants arrive at the moment of the edit, not only if someone thought
 * to go read them.
 *
 * Reads the hook payload on stdin, never blocks, and stays silent for
 * unguarded paths. Any failure exits 0 with no output: a broken reminder must
 * never break an edit.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { guardsFor } from "../../.github/scripts/domain-guards";

const RULE_HEADING = /^### ([A-Z]{3}-\d{3}) — (.+)$/gm;
const SEVERITY = /^\s*severity:\s*(\w+)/m;
const YAML_BLOCK = /```yaml\n([\s\S]*?)```/g;

interface RuleSummary {
  id: string;
  severity: string;
  title: string;
}

function rulesForDomain(root: string, domain: string): RuleSummary[] {
  const source = readFileSync(
    resolve(root, ".domain", domain, "rules.md"),
    "utf8"
  );
  const headings = [...source.matchAll(RULE_HEADING)];
  const blocks = [...source.matchAll(YAML_BLOCK)];

  return headings.map((heading, i) => ({
    id: heading[1],
    title: heading[2],
    severity: blocks[i]?.[1].match(SEVERITY)?.[1] ?? "unknown",
  }));
}

async function main() {
  // biome-ignore lint/correctness/noUndeclaredVariables: Bun global
  const payload = JSON.parse(await Bun.stdin.text()) as {
    cwd?: string;
    tool_input?: { file_path?: string };
  };

  const filePath = payload.tool_input?.file_path;
  if (!filePath) {
    return;
  }

  const root = payload.cwd ?? process.cwd();
  const relativePath = isAbsolute(filePath)
    ? relative(root, filePath)
    : filePath;

  const guards = guardsFor(relativePath);
  if (guards.length === 0) {
    return;
  }

  const lines: string[] = [
    `\`${relativePath}\` is domain-guarded. Rules that govern it:`,
    "",
  ];

  for (const domain of [...new Set(guards.map((g) => g.domain))]) {
    lines.push(`**${domain}** — \`.domain/${domain}/rules.md\``);
    for (const rule of rulesForDomain(root, domain)) {
      const mark = rule.severity === "critical" ? " **[critical]**" : "";
      lines.push(`- \`${rule.id}\`${mark} ${rule.title}`);
    }
    lines.push("");
  }

  lines.push(
    "If this edit changes behaviour a rule describes, update the rule in the",
    "same change. If it upholds a non-obvious invariant, cite it in a comment",
    "(`Rule: XXX-NNN — …`). If the code and a rule already disagree, stop and",
    "report both sides — never edit a rule to match code you just wrote."
  );

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: lines.join("\n"),
      },
    })
  );
}

main().catch(() => {
  // A reminder that fails must not fail the edit.
  process.exit(0);
});
