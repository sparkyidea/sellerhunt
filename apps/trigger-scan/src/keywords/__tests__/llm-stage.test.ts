import { describe, expect, it } from "vitest";
import {
  KEYWORD_LLM_MODEL,
  MAX_TITLES_PER_REQUEST,
  type PhraseParser,
} from "../extract-keywords";
import {
  type KeywordStore,
  type ListingTitle,
  runKeywordLlmStage,
} from "../llm-stage";

const MARKETPLACE = "ebay";
const INPUT_LINE = /^\[(\d+)\]/gm;

function listings(count: number): ListingTitle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `listing-${i}`,
    title: `Listing title ${i}`,
  }));
}

/**
 * Parser that answers each input line with `phraseFor(index)` (an
 * `undefined` answer skips that line) or throws when `failCall` matches
 * the 1-based call number. Records the size and model of every call.
 */
function answering(
  phraseFor: (index: number) => string | undefined,
  failCall?: number
): { calls: number[]; models: string[]; parse: PhraseParser } {
  const calls: number[] = [];
  const models: string[] = [];
  const parse: PhraseParser = (body) => {
    const request = body as { input?: unknown; model?: string };
    const input = String(request.input ?? "");
    const indexes = [...input.matchAll(INPUT_LINE)].map((match) =>
      Number(match[1])
    );
    calls.push(indexes.length);
    models.push(request.model ?? "");
    if (failCall === calls.length) {
      return Promise.reject(new Error("upstream timeout"));
    }
    const items = indexes.flatMap((index) => {
      const phrase = phraseFor(index);
      return phrase === undefined
        ? []
        : [{ keyword: phrase, indexes: [index] }];
    });
    return Promise.resolve({ output_parsed: { items }, status: "completed" });
  };
  return { calls, models, parse };
}

class MemoryStore implements KeywordStore {
  failSave = false;
  keywords: { keyword: string; marketplace: string }[] = [];

  saveKeyword(input: {
    keyword: string;
    marketplace: string;
  }): Promise<{ keywordId: string }> {
    if (this.failSave) {
      return Promise.reject(new Error("db down"));
    }
    this.keywords.push(input);
    return Promise.resolve({ keywordId: String(this.keywords.length) });
  }
}

describe("runKeywordLlmStage", () => {
  it("saves phrases to the pool without listing links or attempt tracking", async () => {
    const store = new MemoryStore();
    const { calls, models, parse } = answering((index) => `phrase ${index}`);
    const input = listings(3);
    const before = structuredClone(input);
    const totals = await runKeywordLlmStage(
      { parse, store },
      MARKETPLACE,
      input
    );
    expect(totals).toEqual({ failed: 0, resolved: 3, unresolved: 0 });
    expect(calls).toEqual([3]);
    expect(models).toEqual([KEYWORD_LLM_MODEL]);
    expect(store.keywords).toEqual(
      [0, 1, 2].map((index) => ({
        marketplace: "ebay",
        keyword: `phrase ${index}`,
      }))
    );
    expect(input).toEqual(before);
  });

  it("trims the phrase but preserves casing and punctuation", async () => {
    const store = new MemoryStore();
    const { parse } = answering(() => "  McDonald's FIFA Squishmallows ");
    await runKeywordLlmStage({ parse, store }, MARKETPLACE, listings(1));
    expect(store.keywords[0]?.keyword).toBe("McDonald's FIFA Squishmallows");
  });

  it("counts missing answers as failures without extra writes", async () => {
    const store = new MemoryStore();
    const { parse } = answering((index) =>
      index === 1 ? undefined : `phrase ${index}`
    );
    const totals = await runKeywordLlmStage(
      { parse, store },
      MARKETPLACE,
      listings(3)
    );
    expect(totals).toEqual({ failed: 1, resolved: 2, unresolved: 0 });
    expect(store.keywords.map((row) => row.keyword)).toEqual([
      "phrase 0",
      "phrase 2",
    ]);
  });

  it("does not save empty phrases", async () => {
    const store = new MemoryStore();
    const { parse } = answering((index) => (index === 0 ? "" : "   "));
    expect(
      await runKeywordLlmStage({ parse, store }, MARKETPLACE, listings(2))
    ).toEqual({ failed: 0, resolved: 0, unresolved: 2 });
    expect(store.keywords).toEqual([]);
  });

  it("continues subsequent chunks after an LLM failure", async () => {
    const store = new MemoryStore();
    const { calls, parse } = answering((index) => `phrase ${index}`, 1);
    expect(
      await runKeywordLlmStage(
        { parse, store },
        MARKETPLACE,
        listings(MAX_TITLES_PER_REQUEST + 3)
      )
    ).toEqual({ failed: MAX_TITLES_PER_REQUEST, resolved: 3, unresolved: 0 });
    expect(calls).toEqual([MAX_TITLES_PER_REQUEST, 3]);
    expect(store.keywords).toHaveLength(3);
  });

  it("counts failed pool writes without failing the scan", async () => {
    const store = new MemoryStore();
    store.failSave = true;
    const { parse } = answering(() => "camera");
    expect(
      await runKeywordLlmStage({ parse, store }, MARKETPLACE, listings(2))
    ).toEqual({ failed: 2, resolved: 0, unresolved: 0 });
  });

  it("makes one call per MAX_TITLES_PER_REQUEST titles", async () => {
    const store = new MemoryStore();
    const { calls, parse } = answering((index) => `phrase ${index}`);
    const count = MAX_TITLES_PER_REQUEST * 2 + 20;
    const totals = await runKeywordLlmStage(
      { parse, store },
      MARKETPLACE,
      listings(count)
    );
    expect(calls).toEqual([MAX_TITLES_PER_REQUEST, MAX_TITLES_PER_REQUEST, 20]);
    expect(totals.resolved).toBe(count);
  });

  it("does nothing for an empty list", async () => {
    const store = new MemoryStore();
    const { calls, parse } = answering(() => "x");
    expect(await runKeywordLlmStage({ parse, store }, MARKETPLACE, [])).toEqual(
      { failed: 0, resolved: 0, unresolved: 0 }
    );
    expect(calls).toEqual([]);
  });
});
