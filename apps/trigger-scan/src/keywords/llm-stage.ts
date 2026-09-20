import { logger } from "@trigger.dev/sdk";
import { chunk } from "../utils/chunk";
import {
  extractKeywords,
  MAX_TITLES_PER_REQUEST,
  type PhraseParser,
} from "./extract-keywords";

export interface ListingTitle {
  id: string;
  title: string;
}

export interface KeywordStore {
  saveKeyword(input: {
    keyword: string;
    marketplace: string;
  }): Promise<{ keywordId: string }>;
}

export interface LlmStageDeps {
  parse: PhraseParser;
  store: KeywordStore;
}

export interface LlmKeywordTotals {
  failed: number;
  resolved: number;
  unresolved: number;
}

/** Extract once for new listings; keyword writes never mutate listing rows. */
export async function runKeywordLlmStage(
  deps: LlmStageDeps,
  marketplace: string,
  listings: readonly ListingTitle[]
): Promise<LlmKeywordTotals> {
  const totals: LlmKeywordTotals = { failed: 0, resolved: 0, unresolved: 0 };
  for (const batch of chunk([...listings], MAX_TITLES_PER_REQUEST)) {
    await resolveChunk(deps, marketplace, batch, totals);
  }
  return totals;
}

async function resolveChunk(
  deps: LlmStageDeps,
  marketplace: string,
  batch: ListingTitle[],
  totals: LlmKeywordTotals
): Promise<void> {
  let answers: Map<number, string>;
  try {
    answers = await extractKeywords(deps.parse, {
      items: batch.map((row, index) => ({ index, title: row.title })),
    });
  } catch (error) {
    logger.warn("Keyword LLM batch failed", {
      marketplace,
      size: batch.length,
      error: errorMessage(error),
    });
    totals.failed += batch.length;
    return;
  }
  for (const [index, row] of batch.entries()) {
    await saveAnswer(deps.store, marketplace, row, answers.get(index), totals);
  }
}

async function saveAnswer(
  store: KeywordStore,
  marketplace: string,
  row: ListingTitle,
  answer: string | undefined,
  totals: LlmKeywordTotals
): Promise<void> {
  if (answer === undefined) {
    logger.warn("Keyword LLM returned no result for listing", {
      listingId: row.id,
      title: row.title,
    });
    totals.failed += 1;
    return;
  }
  const keyword = answer.trim();
  if (!keyword) {
    totals.unresolved += 1;
    return;
  }
  try {
    const { keywordId } = await store.saveKeyword({ marketplace, keyword });
    logger.info("Extracted keyword", {
      listingId: row.id,
      title: row.title,
      keyword,
      keywordId,
    });
    totals.resolved += 1;
  } catch (error) {
    logger.warn("Keyword save failed", {
      listingId: row.id,
      keyword,
      error: errorMessage(error),
    });
    totals.failed += 1;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
