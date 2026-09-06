/**
 * Keyword extraction: ask the model for the search phrase a shopper would
 * type for each listing title, as strict structured output. Batched — one
 * call covers up to `MAX_TITLES_PER_REQUEST` titles (50, the same as a
 * listing leaf, so a leaf normally makes one call).
 *
 * The model answers one item per distinct keyword with every input index
 * that gets it (`{ keyword, indexes }`), not one item per title: a repeated
 * product costs one phrase instead of N output tokens, and the model has to
 * make the "same product" call explicitly. `extractKeywords` flattens that
 * back to one phrase per index.
 *
 * The phrase is product-level, not variant-level: 1 to 5 lowercase words
 * naming brand, line, model and product type. Colors, capacity, sizes and
 * the other options a shopper would pick with a filter are deleted, so one
 * keyword finds the listing's related listings rather than one exact SKU.
 * Only the title goes to the model; the category is not sent.
 *
 * Model, reasoning effort and the request cap are constants here, next to
 * the prompt, because the four are tuned together: a prompt that behaves on
 * one model/effort may not on another. Change them as a unit and measure
 * with `scripts/bench-keywords.ts` (fixture of real titles with accepted
 * phrases) before shipping; `scripts/try-keywords.ts` prints answers for ad
 * hoc titles. The only runtime knob is the `scan_config.keyword_llm_enabled`
 * kill switch.
 *
 * Titles are passed verbatim and the phrase is used exactly as the model
 * returned it: there is no local normalization or scoring anywhere in the
 * flow. The prompt asks for lowercase so learned phrases meet the lowercased
 * manual seeds on the `(marketplace, keyword)` unique index.
 *
 * Reasoning models (gpt-5*, o*) reject `temperature`, so they get
 * `reasoning.effort` instead. Other models get `temperature: 0`.
 *
 * A title the model cannot name comes back as an empty phrase, which the
 * stage counts as an attempt without learning anything.
 */
import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

/** Production model. */
export const KEYWORD_LLM_MODEL = "gpt-5-nano";

/**
 * Benchmark (`scripts/bench-keywords.ts`, 50 titles, 2 runs each, grouped
 * output, 2026-09-06): "low" ≈ 30/50 match at 2500–3500 output tokens and
 * 10–20 s; "minimal" ≈ 27/50 at ~500 output tokens and ~4 s. "minimal" is
 * only viable with the grouped output — one item per title at "minimal"
 * falls to ~15/50.
 */
export const KEYWORD_LLM_REASONING_EFFORT: ReasoningEffort = "minimal";

/**
 * Titles per request. 50 titles take ~4 s at minimal effort (10–20 s at
 * low), inside the client's 60 s timeout. A leaf sends at most K (50)
 * titles, so it makes one call; the retry tool chunks larger picks.
 */
export const MAX_TITLES_PER_REQUEST = 50;

/** One distinct keyword and every input index that gets it. */
export const keywordGroupSchema = z.object({
  keyword: z.string(),
  indexes: z.array(z.number().int()),
});

export const keywordBatchSchema = z.object({
  items: z.array(keywordGroupSchema),
});

export interface ExtractItem {
  index: number;
  title: string;
}

export interface ExtractKeywordsOptions {
  /** Defaults to `SYSTEM_PROMPT`; the benchmark overrides it to A/B prompts. */
  instructions?: string;
  items: readonly ExtractItem[];
  /** Defaults to `KEYWORD_LLM_MODEL`; the tryout script overrides it. */
  model?: string;
  /** Reasoning models only. Defaults to `KEYWORD_LLM_REASONING_EFFORT`. */
  reasoningEffort?: ReasoningEffort;
}

type ParseBody = Parameters<OpenAI["responses"]["parse"]>[0];

export interface PhraseParseResponse {
  incomplete_details?: { reason?: string } | null;
  output_parsed: unknown;
  status?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    /** Reasoning tokens; already counted inside `output_tokens`. */
    output_tokens_details?: { reasoning_tokens?: number } | null;
  } | null;
}

/** `(body) => client.responses.parse(body)` in production; a fake in tests. */
export type PhraseParser = (body: ParseBody) => Promise<PhraseParseResponse>;

export const SYSTEM_PROMPT = `Extract the core product search keywords from each input title.

Keep only words needed to describe the product generically: product type, product family / line, brand, exact marketed model, character / franchise subject, and form factor / subtype.

Exclude generation / version, named edition / collaboration, compatibility / platform, compatibility brand / product line / model, audience / demographic, technical specifications / ratings, color, finish / appearance, capacity / storage, size / dimensions, material, region / language, condition / grade, completeness / included items, quantity / pack count, promotion / rarity / hype, warranty / guarantee, shipping / location / availability, returns / payment terms, authenticity claims, packaging state, carrier / network status, seller / store information, decorative text / emojis, marketplace / catalog IDs, serial / device identifiers, technical model / part identifiers, hardware / internal revisions, and white-label / seller-created brand.

Prefer broader product-family wording over exact configuration wording when both identify what is being sold. Remove details that only distinguish one model, generation, configuration, listing, seller, or individual unit.

Input: one title per line as "[index] title".

Output: one item per distinct keyword. keyword is lowercase, 1-5 words; indexes lists every input line that gets that keyword. Use "" as the keyword for lines that are not one identifiable product. Every input index appears exactly once.`;
const REASONING_MODEL = /^\s*(gpt-5|o\d)/i;

/** Sampling / reasoning knobs the model family accepts. */
export function modelParams(
  model: string,
  effort: ReasoningEffort = KEYWORD_LLM_REASONING_EFFORT
): Pick<ParseBody, "reasoning" | "temperature"> {
  return REASONING_MODEL.test(model)
    ? { reasoning: { effort } }
    : { temperature: 0 };
}

export function buildUserPrompt(items: readonly ExtractItem[]): string {
  return items.map((item) => `[${item.index}] ${item.title}`).join("\n");
}

/**
 * One structured-output request for the whole batch. Flattens the keyword
 * groups to phrases keyed by input index, exactly as returned. Indexes the
 * model invented (out of range) or listed twice (first group wins) are
 * ignored; an input the model skipped is simply absent, and the caller
 * counts it as a failed attempt.
 */
export async function extractKeywords(
  parse: PhraseParser,
  options: ExtractKeywordsOptions
): Promise<Map<number, string>> {
  if (options.items.length === 0) {
    return new Map();
  }
  const model = options.model ?? KEYWORD_LLM_MODEL;
  const response = await parse({
    model,
    ...modelParams(model, options.reasoningEffort),
    instructions: options.instructions ?? SYSTEM_PROMPT,
    input: buildUserPrompt(options.items),
    text: { format: zodTextFormat(keywordBatchSchema, "search_phrases") },
  });

  const parsed = keywordBatchSchema.safeParse(response.output_parsed);
  if (!parsed.success) {
    throw new Error(
      `extractKeywords: no parsed output (status=${response.status ?? "unknown"}, reason=${response.incomplete_details?.reason ?? "none"})`
    );
  }

  const known = new Set(options.items.map((item) => item.index));
  const out = new Map<number, string>();
  for (const group of parsed.data.items) {
    for (const index of group.indexes) {
      if (known.has(index) && !out.has(index)) {
        out.set(index, group.keyword);
      }
    }
  }
  return out;
}
