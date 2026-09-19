import { beforeEach, expect, it, vi } from "vitest";
import type { PhraseParser } from "../../../keywords/extract-keywords";
import { resolveKeywordsWithLlm } from "../resolve-keywords-with-llm";

const mocks = vi.hoisted(() => ({
  createOpenAIClient: vi.fn(),
  saveKeyword: vi.fn(),
}));
vi.mock("@trigger.dev/sdk", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../keywords/openai-client", () => ({
  createOpenAIClient: mocks.createOpenAIClient,
}));
vi.mock("../keyword-store", () => ({
  dbKeywordStore: { saveKeyword: mocks.saveKeyword },
}));

const input = [{ id: "listing", title: "Camera" }];
const parse = vi.fn<PhraseParser>();
beforeEach(() => {
  vi.resetAllMocks();
  mocks.saveKeyword.mockResolvedValue({ keywordId: "keyword" });
  parse.mockResolvedValue({
    status: "completed",
    output_parsed: { items: [{ keyword: "camera", indexes: [0] }] },
  });
});

it("skips disabled extraction without calling the model or store", async () => {
  expect(
    await resolveKeywordsWithLlm(
      "ebay",
      { keywordLlmEnabled: false },
      input,
      parse
    )
  ).toEqual({ resolved: 0, unresolved: 0, failed: 0, llmSkipped: 1 });
  expect(parse).not.toHaveBeenCalled();
  expect(mocks.saveKeyword).not.toHaveBeenCalled();
});

it("skips an empty input before acquiring an LLM client", async () => {
  expect(
    await resolveKeywordsWithLlm("ebay", { keywordLlmEnabled: true }, [])
  ).toEqual({ resolved: 0, unresolved: 0, failed: 0, llmSkipped: 0 });
  expect(mocks.createOpenAIClient).not.toHaveBeenCalled();
});

it("missing LLM credentials do not fail a saved scan", async () => {
  mocks.createOpenAIClient.mockImplementation(() => {
    throw new Error("Missing key");
  });
  expect(
    await resolveKeywordsWithLlm("ebay", { keywordLlmEnabled: true }, input)
  ).toEqual({ resolved: 0, unresolved: 0, failed: 0, llmSkipped: 1 });
  expect(mocks.saveKeyword).not.toHaveBeenCalled();
});

it("saves only a marketplace phrase, without passing a listing link to the store", async () => {
  expect(
    await resolveKeywordsWithLlm(
      "ebay",
      { keywordLlmEnabled: true },
      input,
      parse
    )
  ).toEqual({ resolved: 1, unresolved: 0, failed: 0, llmSkipped: 0 });
  expect(mocks.saveKeyword).toHaveBeenCalledWith({
    marketplace: "ebay",
    keyword: "camera",
  });
});
