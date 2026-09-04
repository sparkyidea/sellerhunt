/**
 * Keyword extraction: ask the model for the search phrase a shopper would
 * type for each listing title, as strict structured output. Batched — one
 * call covers up to `MAX_TITLES_PER_REQUEST` titles (50, the same as a
 * listing leaf, so a leaf normally makes one call).
 *
 * The phrase is product-level, not variant-level: 2 to 5 lowercase words
 * naming brand, line, model and product type. Colors, capacity, sizes and
 * the other options a shopper would pick with a filter are deleted, so one
 * keyword finds the listing's related listings rather than one exact SKU.
 * The prompt is written as an ordered procedure with hard constraints; the
 * examples only show the level of detail and never carry a rule.
 *
 * Model, reasoning effort and the request cap are constants here, next to
 * the prompt, because the four are tuned together: a prompt that behaves on
 * one model/effort may not on another. Change them as a unit and verify with
 * `scripts/try-keywords.ts` before shipping. The only runtime knob is the
 * `scan_config.keyword_llm_enabled` kill switch.
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
 * "minimal" is cheaper but ignores the delete list — colors, condition and
 * shipping words leak into the phrase. "low" follows it.
 */
export const KEYWORD_LLM_REASONING_EFFORT: ReasoningEffort = "low";

/**
 * Titles per request. 50 titles take 20–40 s at low effort, inside the
 * client's 60 s timeout. A leaf sends at most K (50) titles, so it makes one
 * call; the retry tool chunks larger picks.
 */
export const MAX_TITLES_PER_REQUEST = 50;

export const keywordItemSchema = z.object({
  index: z.number().int(),
  searchPhrase: z.string(),
});

export const keywordBatchSchema = z.object({
  items: z.array(keywordItemSchema),
});

export interface ExtractItem {
  /** Category breadcrumb as "Root > Leaf", or null when unknown. */
  category: string | null;
  index: number;
  title: string;
}

export interface ExtractKeywordsOptions {
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
  usage?: { input_tokens?: number; output_tokens?: number } | null;
}

/** `(body) => client.responses.parse(body)` in production; a fake in tests. */
export type PhraseParser = (body: ParseBody) => Promise<PhraseParseResponse>;

export const SYSTEM_PROMPT = `You turn marketplace listing titles into search keywords.

A keyword is what a shopper types to find this kind of product: 2 to 5 words, lowercase, like a shelf label. It names the product, not this particular unit and not the listing.

Consistency matters more than variety: titles for the same product must get the exact same keyword, character for character. Repeats across lines are expected and correct. Never change the wording, add a word, or drop a word just to make two lines differ.

For each title:
1. Decide what is being sold. When a part or accessory is sold on its own (charging case only, right earbud, controller, power adapter), that part is the product. Ignore anything that merely comes with it (box, charger, cords, games, extra controllers).
2. Keep only: the brand when the title names one, the product line, a model name or number only when the line has several models and that number is how shoppers tell them apart (ps vita pch-1000 vs pch-2000, wh-1000xm4 vs wh-1000xm5), and a qualifier only when it makes a different product (pro, max, lite, mini, oled, xl, left/right, "for <device>", "set" only when the maker sells the product as a set). These qualifiers always survive the deletions in step 3: an oled, lite or pro model keeps that word every time. Add a product-type word (console, phone, controller, case) only when the name alone does not say what the item is: "nintendo switch", never "nintendo switch console"; but "nintendo switch case" for a case. When the name already identifies the product, delete any code that follows it: "nintendo switch hac-001" is "nintendo switch"; "iphone 15 pro max a2849" is "apple iphone 15 pro max".
3. Delete everything else: colors and "select color", finishes, capacity, sizes, dimensions, materials, region or language (region free, japanese edition, jp), condition and grades (excellent, tested, s rank, 3rank, junk, for parts, unpatched), completeness and quantity (complete set, full set, in box, cib, set of 2, 2 pack, lot, x10, bundle), "only", original, genuine, oem, replacement, new, shipping (ship from us, 1day shipping), warranty, promo words (you pick, buy more and save), seller notes, emojis, internal part numbers and hardware revisions (a2190, hac-001, v1), years unless part of the name.
4. Within a phrase say each concept once and never add a synonym. Keep the maker's spelling of names (ps vita, joy-con, wh-1000xm4); never join or split words.
5. Return an empty searchPhrase only when the title is not one identifiable product: a lot of unrelated items, a vague title, not an item. An unfamiliar brand or a foreign name is still a product.

Return exactly one item per input line, in input order, with the same index. Never skip a line, never add one, never invent a product not in the title.

Input lines are "[index] (category) title"; the category may be absent.

Examples of the level of detail. Lines 4 and 5 are the same product, so they get the same keyword; line 6 is a different model, so it keeps its qualifier:
[0] Apple iPhone 15 Pro Max 256GB Blue Titanium Unlocked - Excellent Condition
-> "apple iphone 15 pro max"
[1] Kitchen Faucet Swivel Single Handle Sink Pull Down Sprayer Mixer Tap Deck Plate
-> "pull down kitchen faucet"
[2] Sony PSP-3000 Select Color w/ Box [Excellent] [Ship From US]
-> "sony psp-3000"
[3] Nintendo Switch Right Joy-Con Neon Red Controller Only OEM Tested
-> "nintendo switch right joy-con"
[4] Nintendo Switch Console complete set HAC-001 Select Colors & Rank
-> "nintendo switch"
[5] Nintendo Switch V1 UNPATCHED HAC-001 Console Only Joy-con AC Adapter
-> "nintendo switch"
[6] Nintendo Switch OLED Model Splatoon 3 Special Edition Console w/ Box Tested
-> "nintendo switch oled"`;

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
  return items
    .map((item) => {
      const category = item.category ? ` (${item.category})` : "";
      return `[${item.index}]${category} ${item.title}`;
    })
    .join("\n");
}

/**
 * One structured-output request for the whole batch. Returns the phrases
 * keyed by input index, exactly as returned. Indexes the model invented
 * (out of range) or repeated (first wins) are ignored; an input the model
 * skipped is simply absent, and the caller counts it as a failed attempt.
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
    instructions: SYSTEM_PROMPT,
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
  for (const item of parsed.data.items) {
    if (known.has(item.index) && !out.has(item.index)) {
      out.set(item.index, item.searchPhrase);
    }
  }
  return out;
}
