#!/usr/bin/env bun
/**
 * Try the keyword prompt on real titles and see what the model returns —
 * the same `extractKeywords` call the scan leaf makes, printed instead of
 * persisted. Nothing is written to the database. Defaults to the production
 * model and effort constants; all titles go out in ONE request (the leaf's
 * per-request cap is not applied here).
 *
 * Run from `apps/trigger-scan` (Bun loads `./.env`; needs `OPENAI_API_KEY`,
 * and `DATABASE_URL` only for `--from-db`):
 *
 *   bun keywords:try "Nintendo Switch Console Neon Blue + Red Joy-Cons 32GB"
 *   bun keywords:try --file titles.txt          # one title per line
 *   pbpaste | bun keywords:try                  # titles on stdin
 *   bun keywords:try --from-db 50               # latest 50 scan_listing titles
 *   bun keywords:try --model gpt-5-mini --effort low "…"
 *   bun keywords:try --json "…"                 # machine-readable output
 *
 * Sources combine: positional titles + --file + --from-db, stdin only when
 * nothing else was given. All titles go out in ONE request, like a leaf.
 */
import { readFile } from "node:fs/promises";
import { text as readStream } from "node:stream/consumers";
import { parseArgs } from "node:util";
import OpenAI from "openai";
import {
  type ExtractItem,
  extractKeywords,
  KEYWORD_LLM_MODEL,
  KEYWORD_LLM_REASONING_EFFORT,
  type PhraseParseResponse,
  type PhraseParser,
  type ReasoningEffort,
} from "../src/keywords/extract-keywords";

const EFFORTS: readonly ReasoningEffort[] = [
  "minimal",
  "low",
  "medium",
  "high",
];
const DEFAULT_MARKETPLACE = "ebay";
const WHITESPACE = /\s+/;

interface Options {
  effort: ReasoningEffort;
  file: string | undefined;
  fromDb: number | undefined;
  json: boolean;
  marketplace: string;
  model: string;
  titles: string[];
}

interface Result {
  phrase: string | null;
  title: string;
}

function parseOptions(argv: string[]): Options {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      effort: { type: "string", default: KEYWORD_LLM_REASONING_EFFORT },
      file: { type: "string" },
      "from-db": { type: "string" },
      json: { type: "boolean", default: false },
      marketplace: { type: "string", default: DEFAULT_MARKETPLACE },
      model: { type: "string", default: KEYWORD_LLM_MODEL },
    },
  });
  const effort = values.effort ?? KEYWORD_LLM_REASONING_EFFORT;
  if (!isEffort(effort)) {
    throw new Error(`--effort must be one of ${EFFORTS.join(", ")}`);
  }
  const fromDb = values["from-db"];
  return {
    effort,
    file: values.file,
    fromDb: fromDb === undefined ? undefined : Number(fromDb),
    json: values.json ?? false,
    marketplace: values.marketplace ?? DEFAULT_MARKETPLACE,
    model: values.model ?? KEYWORD_LLM_MODEL,
    titles: positionals,
  };
}

function isEffort(value: string): value is ReasoningEffort {
  return (EFFORTS as readonly string[]).includes(value);
}

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function collectTitles(options: Options): Promise<string[]> {
  const titles = [...options.titles];
  if (options.file) {
    titles.push(...splitLines(await readFile(options.file, "utf8")));
  }
  if (options.fromDb !== undefined) {
    titles.push(
      ...(await loadTitlesFromDb(options.marketplace, options.fromDb))
    );
  }
  if (titles.length === 0 && !process.stdin.isTTY) {
    titles.push(...splitLines(await readStream(process.stdin)));
  }
  return titles;
}

/** Latest titles for the marketplace. Imported lazily so the DB env is only needed here. */
async function loadTitlesFromDb(
  marketplace: string,
  limit: number
): Promise<string[]> {
  const [{ db }, { scanListing }, { desc, eq }] = await Promise.all([
    import("@dashseller/db"),
    import("@dashseller/db/schema"),
    import("drizzle-orm"),
  ]);
  const rows = await db
    .select({ title: scanListing.title })
    .from(scanListing)
    .where(eq(scanListing.marketplace, marketplace))
    .orderBy(desc(scanListing.createdAt))
    .limit(Math.max(1, limit));
  return rows.map((row) => row.title);
}

function describePhrase(phrase: string | null): string {
  if (phrase === null) {
    return "(no answer for this line)";
  }
  if (phrase.trim().length === 0) {
    return '"" (empty → unresolved)';
  }
  const words = phrase.trim().split(WHITESPACE).length;
  return `"${phrase}" (${words} words)`;
}

function printResults(
  options: Options,
  results: Result[],
  elapsedMs: number,
  usage: PhraseParseResponse["usage"]
): void {
  console.log(
    `model ${options.model}  effort ${options.effort}  titles ${results.length}  ` +
      `${elapsedMs} ms  tokens in/out ${usage?.input_tokens ?? "?"}/${usage?.output_tokens ?? "?"}`
  );
  console.log("");
  for (const [index, result] of results.entries()) {
    console.log(`[${index}] ${describePhrase(result.phrase)}`);
    console.log(`    ${result.title}`);
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const titles = await collectTitles(options);
  if (titles.length === 0) {
    console.error(
      "No titles. Pass them as arguments, --file <path>, --from-db <n>, or on stdin."
    );
    process.exit(1);
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Run from apps/trigger-scan so Bun loads ./.env."
    );
  }

  const client = new OpenAI({ apiKey });
  const seen: { last?: PhraseParseResponse } = {};
  const parse: PhraseParser = async (body) => {
    const response = await client.responses.parse(body);
    seen.last = response;
    return response;
  };

  const items: ExtractItem[] = titles.map((title, index) => ({
    index,
    title,
    category: null,
  }));
  const started = performance.now();
  const answers = await extractKeywords(parse, {
    items,
    model: options.model,
    reasoningEffort: options.effort,
  });
  const elapsedMs = Math.round(performance.now() - started);
  const results: Result[] = items.map((item) => ({
    title: item.title,
    phrase: answers.get(item.index) ?? null,
  }));

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          model: options.model,
          effort: options.effort,
          elapsedMs,
          usage: seen.last?.usage ?? null,
          results,
        },
        null,
        2
      )
    );
  } else {
    printResults(options, results, elapsedMs, seen.last?.usage);
  }
  // The DB pool (when --from-db was used) would otherwise keep the process alive.
  process.exit(0);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
