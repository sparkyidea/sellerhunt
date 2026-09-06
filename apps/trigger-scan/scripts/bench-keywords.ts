#!/usr/bin/env bun
/**
 * Keyword-prompt benchmark: run the fixture titles through `extractKeywords`
 * and score the answers. Use it to compare prompts, models and reasoning
 * efforts before changing the production constants in
 * `src/keywords/extract-keywords.ts`. Nothing is written to the database.
 *
 * Fixture (`scripts/keyword-benchmark/titles.json`): real `scan_listing`
 * titles, each with the accepted phrases (first is the preferred one).
 *
 * Scores:
 *   match       answer is one of the accepted phrases (after trim/lowercase)
 *   missing     the model skipped the line (parser returned no answer)
 *   empty       the model answered "" (not one identifiable product)
 *   stable      with `--runs N`, titles whose answer was identical every run
 *
 * Run from `apps/trigger-scan` (Bun loads `./.env`; needs `OPENAI_API_KEY`):
 *
 *   bun keywords:bench                                   # production prompt/model/effort
 *   bun keywords:bench --prompt path/to/prompt.txt      # A/B a prompt file
 *   bun keywords:bench --model gpt-5-mini --effort low
 *   bun keywords:bench --runs 3                          # repeat to see stability
 *   bun keywords:bench --json                            # also print the JSON to stdout
 *   bun keywords:bench --out results/my-run.json         # choose the results file
 *
 * Every run writes the full JSON (every title, answer, expected, match,
 * tokens) to `--out`, default
 * `scripts/keyword-benchmark/results/<timestamp>-<model>-<effort>.json`
 * (gitignored). The directory is created when missing.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import OpenAI from "openai";
import { z } from "zod";
import {
  type ExtractItem,
  extractKeywords,
  KEYWORD_LLM_MODEL,
  KEYWORD_LLM_REASONING_EFFORT,
  MAX_TITLES_PER_REQUEST,
  type PhraseParseResponse,
  type PhraseParser,
  type ReasoningEffort,
} from "../src/keywords/extract-keywords";
import { chunk } from "../src/utils/chunk";

const EFFORTS: readonly ReasoningEffort[] = [
  "minimal",
  "low",
  "medium",
  "high",
];
const DEFAULT_FIXTURE = new URL(
  "./keyword-benchmark/titles.json",
  import.meta.url
).pathname;
const WHITESPACE = /\s+/g;
const RESULTS_DIR = new URL("./keyword-benchmark/results/", import.meta.url)
  .pathname;
const UNSAFE_PATH_CHARS = /[^a-z0-9._-]+/gi;
/** Sentinel for "no answer" when comparing phrases; cannot collide with a normalized phrase. */
const MISSING = " missing";

const fixtureSchema = z.array(
  z.object({
    expected: z.array(z.string()).min(1),
    title: z.string().min(1),
  })
);
type FixtureItem = z.infer<typeof fixtureSchema>[number];

interface Options {
  effort: ReasoningEffort;
  fixture: string;
  json: boolean;
  model: string;
  out: string;
  prompt: string | undefined;
  runs: number;
}

interface RunResult {
  /** Per fixture index; `null` when the model skipped the line. */
  answers: (string | null)[];
  elapsedMs: number;
  usage: { input: number; output: number; reasoning: number };
}

interface ItemScore {
  expected: string[];
  got: string | null;
  match: boolean;
  title: string;
}

interface RunScore {
  elapsedMs: number;
  empty: number;
  items: ItemScore[];
  matched: number;
  missing: number;
  usage: { input: number; output: number; reasoning: number };
}

function parseOptions(argv: string[]): Options {
  const { values } = parseArgs({
    args: argv,
    options: {
      effort: { type: "string", default: KEYWORD_LLM_REASONING_EFFORT },
      fixture: { type: "string", default: DEFAULT_FIXTURE },
      json: { type: "boolean", default: false },
      model: { type: "string", default: KEYWORD_LLM_MODEL },
      out: { type: "string" },
      prompt: { type: "string" },
      runs: { type: "string", default: "1" },
    },
  });
  const effort = values.effort ?? KEYWORD_LLM_REASONING_EFFORT;
  if (!isEffort(effort)) {
    throw new Error(`--effort must be one of ${EFFORTS.join(", ")}`);
  }
  const runs = Number(values.runs ?? "1");
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error("--runs must be a positive integer");
  }
  const model = values.model ?? KEYWORD_LLM_MODEL;
  return {
    effort,
    fixture: values.fixture ?? DEFAULT_FIXTURE,
    json: values.json ?? false,
    model,
    out: values.out ?? defaultOutPath(model, effort),
    prompt: values.prompt,
    runs,
  };
}

/** `results/2026-09-06T10-45-12-gpt-5-nano-low.json` */
function defaultOutPath(model: string, effort: ReasoningEffort): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const safeModel = model.replace(UNSAFE_PATH_CHARS, "_");
  return `${RESULTS_DIR}${stamp}-${safeModel}-${effort}.json`;
}

function isEffort(value: string): value is ReasoningEffort {
  return (EFFORTS as readonly string[]).includes(value);
}

function normalize(phrase: string | null): string {
  return phrase === null
    ? MISSING
    : phrase.trim().toLowerCase().replace(WHITESPACE, " ");
}

async function loadFixture(path: string): Promise<FixtureItem[]> {
  const parsed = fixtureSchema.safeParse(
    JSON.parse(await readFile(path, "utf8"))
  );
  if (!parsed.success) {
    throw new Error(`Bad fixture ${path}: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** One pass over the fixture: `MAX_TITLES_PER_REQUEST` titles per call. */
async function runOnce(
  client: OpenAI,
  options: Options,
  fixture: FixtureItem[],
  instructions: string | undefined
): Promise<RunResult> {
  const usage = { input: 0, output: 0, reasoning: 0 };
  const parse: PhraseParser = async (body) => {
    const response: PhraseParseResponse = await client.responses.parse(body);
    usage.input += response.usage?.input_tokens ?? 0;
    usage.output += response.usage?.output_tokens ?? 0;
    usage.reasoning +=
      response.usage?.output_tokens_details?.reasoning_tokens ?? 0;
    return response;
  };
  const items: ExtractItem[] = fixture.map((item, index) => ({
    index,
    title: item.title,
  }));
  const answers: (string | null)[] = items.map(() => null);
  const started = performance.now();
  for (const batch of chunk(items, MAX_TITLES_PER_REQUEST)) {
    const got = await extractKeywords(parse, {
      items: batch,
      instructions,
      model: options.model,
      reasoningEffort: options.effort,
    });
    for (const item of batch) {
      answers[item.index] = got.get(item.index) ?? null;
    }
  }
  return {
    answers,
    elapsedMs: Math.round(performance.now() - started),
    usage,
  };
}

function scoreItems(fixture: FixtureItem[], run: RunResult): ItemScore[] {
  return fixture.map((item, index) => {
    const got = run.answers[index] ?? null;
    const accepted = new Set(item.expected.map(normalize));
    return {
      expected: item.expected,
      got,
      match: got !== null && accepted.has(normalize(got)),
      title: item.title,
    };
  });
}

function score(fixture: FixtureItem[], run: RunResult): RunScore {
  const items = scoreItems(fixture, run);
  return {
    elapsedMs: run.elapsedMs,
    empty: items.filter((item) => item.got !== null && item.got.trim() === "")
      .length,
    items,
    matched: items.filter((item) => item.match).length,
    missing: items.filter((item) => item.got === null).length,
    usage: run.usage,
  };
}

function describe(got: string | null): string {
  if (got === null) {
    return "(missing)";
  }
  return got.trim() === "" ? '""' : `"${got}"`;
}

function printRun(runIndex: number, total: number, run: RunScore): void {
  const n = run.items.length;
  console.log(
    `run ${runIndex + 1}/${total}  match ${run.matched}/${n}  ` +
      `missing ${run.missing}  empty ${run.empty}  ` +
      `${run.elapsedMs} ms  tokens in/out/reasoning ${run.usage.input}/${run.usage.output}/${run.usage.reasoning}`
  );
  for (const [index, item] of run.items.entries()) {
    if (item.match) {
      continue;
    }
    console.log(`  [${index}] got ${describe(item.got)}`);
    console.log(
      `       want ${item.expected.map((e) => `"${e}"`).join(" | ")}`
    );
    console.log(`       ${item.title}`);
  }
}

/** Titles whose answer was identical across every run. */
function stableCount(runs: RunScore[]): number {
  const first = runs[0];
  if (first === undefined) {
    return 0;
  }
  return first.items.filter((_, index) => {
    const phrases = new Set(
      runs.map((run) => normalize(run.items[index]?.got ?? null))
    );
    return phrases.size === 1;
  }).length;
}

function printSummary(options: Options, runs: RunScore[]): void {
  const n = runs[0]?.items.length ?? 0;
  const avg = (pick: (run: RunScore) => number): string =>
    (runs.reduce((sum, run) => sum + pick(run), 0) / runs.length).toFixed(1);
  console.log("");
  console.log(
    `model ${options.model}  effort ${options.effort}  prompt ${options.prompt ?? "SYSTEM_PROMPT"}  titles ${n}  runs ${runs.length}`
  );
  console.log(
    `avg match ${avg((run) => run.matched)}/${n}  ` +
      `stable across runs ${stableCount(runs)}/${n}  ` +
      `avg tokens in/out/reasoning ${avg((run) => run.usage.input)}/${avg((run) => run.usage.output)}/${avg((run) => run.usage.reasoning)}  ` +
      `avg ${avg((run) => run.elapsedMs)} ms`
  );
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const fixture = await loadFixture(options.fixture);
  const instructions = options.prompt
    ? (await readFile(options.prompt, "utf8")).trim()
    : undefined;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Run from apps/trigger-scan so Bun loads ./.env."
    );
  }
  const client = new OpenAI({ apiKey });

  const runs: RunScore[] = [];
  for (let i = 0; i < options.runs; i += 1) {
    const run = score(
      fixture,
      await runOnce(client, options, fixture, instructions)
    );
    runs.push(run);
    if (!options.json) {
      printRun(i, options.runs, run);
    }
  }

  const report = JSON.stringify(
    {
      model: options.model,
      effort: options.effort,
      prompt: options.prompt ?? null,
      instructions: instructions ?? null,
      fixture: options.fixture,
      stable: stableCount(runs),
      runs,
    },
    null,
    2
  );
  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, `${report}\n`, "utf8");

  if (options.json) {
    console.log(report);
  } else {
    printSummary(options, runs);
  }
  console.error(`saved ${options.out}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
