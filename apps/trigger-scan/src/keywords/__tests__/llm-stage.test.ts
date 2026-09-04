import { describe, expect, it } from "vitest";
import {
  KEYWORD_LLM_MODEL,
  MAX_TITLES_PER_REQUEST,
  type PhraseParser,
} from "../extract-keywords";
import {
  type KeywordStore,
  type LinkListingKeywordInput,
  runKeywordLlmStage,
  type UnresolvedListing,
} from "../llm-stage";

const MARKETPLACE = "ebay";
const INPUT_LINE = /^\[(\d+)\]/gm;

function listings(count: number): UnresolvedListing[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `listing-${i}`,
    title: `Listing title ${i}`,
    categoryPath: i % 2 === 0 ? ["Root", "Leaf"] : null,
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
      return phrase === undefined ? [] : [{ index, searchPhrase: phrase }];
    });
    return Promise.resolve({ output_parsed: { items }, status: "completed" });
  };
  return { calls, models, parse };
}

class MemoryStore implements KeywordStore {
  /** Listing ids another run already linked; `linkListingKeyword` reports `linked: false`. */
  alreadyLinked = new Set<string>();
  bumps: string[][] = [];
  failBump = false;
  failLink = false;
  links: LinkListingKeywordInput[] = [];

  bumpKeywordAttempts(listingIds: readonly string[]): Promise<void> {
    if (this.failBump) {
      return Promise.reject(new Error("db down"));
    }
    this.bumps.push([...listingIds]);
    return Promise.resolve();
  }

  linkListingKeyword(
    input: LinkListingKeywordInput
  ): Promise<{ keywordId: string; linked: boolean }> {
    if (this.failLink) {
      return Promise.reject(new Error("unique violation"));
    }
    if (this.alreadyLinked.has(input.listingId)) {
      return Promise.resolve({ keywordId: "kw-other-run", linked: false });
    }
    this.links.push(input);
    return Promise.resolve({
      keywordId: `kw-${this.links.length}`,
      linked: true,
    });
  }
}

describe("runKeywordLlmStage", () => {
  it("links every listing with the phrase as returned and spends no attempt", async () => {
    const store = new MemoryStore();
    const { calls, models, parse } = answering((index) => `phrase ${index}`);

    const totals = await runKeywordLlmStage(
      { parse, store },
      MARKETPLACE,
      listings(3)
    );

    expect(totals).toEqual({ failed: 0, resolved: 3, unresolved: 0 });
    expect(calls).toEqual([3]);
    expect(models).toEqual([KEYWORD_LLM_MODEL]);
    expect(store.links.map((link) => link.keyword)).toEqual([
      "phrase 0",
      "phrase 1",
      "phrase 2",
    ]);
    expect(store.links[0]).toEqual({
      listingId: "listing-0",
      marketplace: "ebay",
      keyword: "phrase 0",
    });
    expect(store.bumps).toEqual([]);
  });

  it("keeps a listing another run linked first and spends no attempt on it", async () => {
    const store = new MemoryStore();
    store.alreadyLinked.add("listing-1");
    const { parse } = answering((index) => `phrase ${index}`);

    const totals = await runKeywordLlmStage(
      { parse, store },
      MARKETPLACE,
      listings(3)
    );

    expect(totals).toEqual({ failed: 0, resolved: 3, unresolved: 0 });
    expect(store.links.map((link) => link.listingId)).toEqual([
      "listing-0",
      "listing-2",
    ]);
    expect(store.bumps).toEqual([]);
  });

  it("trims the phrase but leaves its casing and punctuation alone", async () => {
    const store = new MemoryStore();
    const { parse } = answering(() => "  McDonald's FIFA Squishmallows ");

    await runKeywordLlmStage({ parse, store }, MARKETPLACE, listings(1));

    expect(store.links[0]?.keyword).toBe("McDonald's FIFA Squishmallows");
  });

  it("counts a missing answer as a failed attempt", async () => {
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
    expect(store.bumps).toEqual([["listing-1"]]);
    expect(store.links.map((link) => link.listingId)).toEqual([
      "listing-0",
      "listing-2",
    ]);
  });

  it("counts an empty or whitespace-only phrase as unresolved without linking", async () => {
    const store = new MemoryStore();
    const { parse } = answering((index) => (index === 0 ? "" : "   "));

    const totals = await runKeywordLlmStage(
      { parse, store },
      MARKETPLACE,
      listings(2)
    );

    expect(totals).toEqual({ failed: 0, resolved: 0, unresolved: 2 });
    expect(store.links).toEqual([]);
    expect(store.bumps).toEqual([["listing-0"], ["listing-1"]]);
  });

  it("charges the whole chunk when the model call throws and keeps going", async () => {
    const store = new MemoryStore();
    const { calls, parse } = answering((index) => `phrase ${index}`, 1);
    const count = MAX_TITLES_PER_REQUEST + 3;

    const totals = await runKeywordLlmStage(
      { parse, store },
      MARKETPLACE,
      listings(count)
    );

    expect(calls).toEqual([MAX_TITLES_PER_REQUEST, 3]);
    expect(totals).toEqual({
      failed: MAX_TITLES_PER_REQUEST,
      resolved: 3,
      unresolved: 0,
    });
    expect(store.bumps).toHaveLength(1);
    expect(store.bumps[0]).toHaveLength(MAX_TITLES_PER_REQUEST);
    expect(store.links.map((link) => link.listingId)).toEqual([
      `listing-${MAX_TITLES_PER_REQUEST}`,
      `listing-${MAX_TITLES_PER_REQUEST + 1}`,
      `listing-${MAX_TITLES_PER_REQUEST + 2}`,
    ]);
  });

  it("counts a failed write as a failed attempt and never rethrows", async () => {
    const store = new MemoryStore();
    store.failLink = true;
    const { parse } = answering((index) => `phrase ${index}`);

    const totals = await runKeywordLlmStage(
      { parse, store },
      MARKETPLACE,
      listings(2)
    );

    expect(totals).toEqual({ failed: 2, resolved: 0, unresolved: 0 });
    expect(store.bumps).toEqual([["listing-0"], ["listing-1"]]);
  });

  it("swallows a failing attempt counter", async () => {
    const store = new MemoryStore();
    store.failBump = true;
    const { parse } = answering(() => "");

    const totals = await runKeywordLlmStage(
      { parse, store },
      MARKETPLACE,
      listings(1)
    );

    expect(totals).toEqual({ failed: 0, resolved: 0, unresolved: 1 });
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

    const totals = await runKeywordLlmStage({ parse, store }, MARKETPLACE, []);

    expect(totals).toEqual({ failed: 0, resolved: 0, unresolved: 0 });
    expect(calls).toEqual([]);
  });
});
