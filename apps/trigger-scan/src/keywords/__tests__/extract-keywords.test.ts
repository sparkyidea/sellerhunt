import { describe, expect, it } from "vitest";
import {
  buildUserPrompt,
  type ExtractItem,
  extractKeywords,
  KEYWORD_LLM_MODEL,
  KEYWORD_LLM_REASONING_EFFORT,
  keywordBatchSchema,
  type PhraseParser,
  SYSTEM_PROMPT,
} from "../extract-keywords";

const ITEMS: ExtractItem[] = [
  {
    index: 0,
    title:
      "2026 McDONALD'S Fifa World Cup Squishmallows Plush HAPPY MEAL TOYS Or Set",
    category: "Toys & Hobbies > Stuffed Animals",
  },
  {
    index: 1,
    title:
      "Kitchen Faucet Swivel Single Handle Sink Pull Down Sprayer Mixer Tap Deck Plate",
    category: null,
  },
];

const FIXTURE = {
  items: [
    { index: 0, searchPhrase: "mcdonald's fifa world cup squishmallows" },
    { index: 1, searchPhrase: "pull down kitchen faucet" },
  ],
};

type Body = Parameters<PhraseParser>[0];

/** A parser that always answers `output` and records how it was called. */
function fakeParser(output: unknown): {
  bodies: Body[];
  parse: PhraseParser;
} {
  const bodies: Body[] = [];
  const parse: PhraseParser = (body) => {
    bodies.push(body);
    return Promise.resolve({ output_parsed: output, status: "completed" });
  };
  return { bodies, parse };
}

describe("buildUserPrompt", () => {
  it("numbers titles, adds the category when known, and passes titles verbatim", () => {
    const prompt = buildUserPrompt(ITEMS);
    expect(prompt).toContain(
      "[0] (Toys & Hobbies > Stuffed Animals) 2026 McDONALD'S Fifa World Cup Squishmallows Plush HAPPY MEAL TOYS Or Set"
    );
    expect(prompt).toContain("[1] Kitchen Faucet Swivel");
    expect(prompt.split("\n")).toHaveLength(2);
  });
});

describe("keywordBatchSchema", () => {
  it("accepts the fixture and rejects an item without a phrase", () => {
    expect(keywordBatchSchema.safeParse(FIXTURE).success).toBe(true);
    expect(
      keywordBatchSchema.safeParse({ items: [{ index: 0 }] }).success
    ).toBe(false);
  });
});

describe("extractKeywords", () => {
  it("sends one strict structured-output request and maps phrases by index", async () => {
    const { bodies, parse } = fakeParser(FIXTURE);

    const results = await extractKeywords(parse, {
      items: ITEMS,
      model: "test-model",
    });

    expect(bodies).toHaveLength(1);
    const sent = bodies[0] as unknown as Record<string, unknown>;
    expect(sent.model).toBe("test-model");
    expect(sent.temperature).toBe(0);
    expect(sent.instructions).toBe(SYSTEM_PROMPT);
    expect(String(sent.input)).toContain("[1] Kitchen Faucet");
    const text = sent.text as {
      format: { type: string; name: string; strict: boolean };
    };
    expect(text.format.type).toBe("json_schema");
    expect(text.format.name).toBe("search_phrases");
    expect(text.format.strict).toBe(true);

    expect(results.get(0)).toBe("mcdonald's fifa world cup squishmallows");
    expect(results.get(1)).toBe("pull down kitchen faucet");
  });

  it("sends 50 titles in exactly one request and maps all 50 answers", async () => {
    const items: ExtractItem[] = Array.from({ length: 50 }, (_, index) => ({
      index,
      title: `Listing title ${index}`,
      category: null,
    }));
    const { bodies, parse } = fakeParser({
      items: items.map((item) => ({
        index: item.index,
        searchPhrase: `phrase ${item.index}`,
      })),
    });

    const results = await extractKeywords(parse, { items, model: "m" });

    expect(bodies).toHaveLength(1);
    expect(String((bodies[0] as unknown as { input: string }).input)).toContain(
      "[49] Listing title 49"
    );
    expect(results.size).toBe(50);
    expect(results.get(49)).toBe("phrase 49");
  });

  it("returns the phrase exactly as the model returned it", async () => {
    const { parse } = fakeParser({
      items: [{ index: 0, searchPhrase: "  Pull Down Kitchen Faucet " }],
    });
    const results = await extractKeywords(parse, {
      items: [{ ...(ITEMS[1] as ExtractItem), index: 0 }],
      model: "m",
    });
    // No trimming, casing or other normalization happens here.
    expect(results.get(0)).toBe("  Pull Down Kitchen Faucet ");
  });

  it("ignores out-of-range and duplicate indexes and leaves skipped inputs absent", async () => {
    const { parse } = fakeParser({
      items: [
        { index: 1, searchPhrase: "first answer" },
        { index: 1, searchPhrase: "second answer" },
        { index: 7, searchPhrase: "invented line" },
        { index: -1, searchPhrase: "negative" },
      ],
    });
    const results = await extractKeywords(parse, { items: ITEMS, model: "m" });
    expect(results.get(1)).toBe("first answer");
    expect(results.has(0)).toBe(false);
    expect(results.has(7)).toBe(false);
    expect(results.has(-1)).toBe(false);
    expect(results.size).toBe(1);
  });

  it("sends low reasoning effort instead of temperature to reasoning models", async () => {
    const { bodies, parse } = fakeParser(FIXTURE);
    await extractKeywords(parse, { items: ITEMS, model: "gpt-5-nano" });
    const sent = bodies[0] as unknown as Record<string, unknown>;
    expect("temperature" in sent).toBe(false);
    expect(sent.reasoning).toEqual({ effort: "low" });
  });

  it("passes a requested reasoning effort through to reasoning models", async () => {
    const { bodies, parse } = fakeParser(FIXTURE);
    await extractKeywords(parse, {
      items: ITEMS,
      model: "gpt-5-nano",
      reasoningEffort: "medium",
    });
    const sent = bodies[0] as unknown as Record<string, unknown>;
    expect(sent.reasoning).toEqual({ effort: "medium" });
  });

  it("uses the production model and effort constants when none are given", async () => {
    const { bodies, parse } = fakeParser(FIXTURE);
    await extractKeywords(parse, { items: ITEMS });
    const sent = bodies[0] as unknown as Record<string, unknown>;
    expect(sent.model).toBe(KEYWORD_LLM_MODEL);
    expect(sent.reasoning).toEqual({ effort: KEYWORD_LLM_REASONING_EFFORT });
  });

  it("throws with the incomplete reason when nothing parsed", async () => {
    const parse: PhraseParser = () =>
      Promise.resolve({
        output_parsed: null,
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      });
    await expect(
      extractKeywords(parse, { items: ITEMS, model: "m" })
    ).rejects.toThrow("max_output_tokens");
  });

  it("does not call the model for an empty batch", async () => {
    const { bodies, parse } = fakeParser(FIXTURE);
    const results = await extractKeywords(parse, { items: [], model: "m" });
    expect(results.size).toBe(0);
    expect(bodies).toHaveLength(0);
  });
});
