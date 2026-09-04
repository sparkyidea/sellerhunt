/**
 * LLM stage of keyword extraction — pure orchestration over an injected
 * parser and store, so it is unit-testable without a database or an API
 * key. Shared by the listing leaf (`scan-listings-by-ids`, inline right
 * after its paced scan) and the manual retry task (`resolve-listing-keywords`)
 * through `nodes/scan/resolve-keywords-with-llm.ts`, which wires the real
 * OpenAI client and DB store.
 *
 * One call per `MAX_TITLES_PER_REQUEST` titles, never one call per title.
 * Never throws: a failed batch, a missing answer, an empty phrase or a
 * failed write only counts an attempt on the affected listings, so a scan
 * run is never failed (and retried, and re-scraped) because of the LLM.
 *
 * The phrase is stored exactly as the model returned it, trimmed. No local
 * normalization or scoring.
 */
import { logger } from "@trigger.dev/sdk";
import { chunk } from "../utils/chunk";
import {
  type ExtractItem,
  extractKeywords,
  MAX_TITLES_PER_REQUEST,
  type PhraseParser,
} from "./extract-keywords";

/** LLM attempts per listing before it is left alone. */
export const MAX_LLM_ATTEMPTS = 3;

export interface UnresolvedListing {
  categoryPath: string[] | null;
  id: string;
  title: string;
}

export interface LinkListingKeywordInput {
  /** The phrase as the model returned it (trimmed). */
  keyword: string;
  listingId: string;
  marketplace: string;
}

/** Persistence the stage needs; `nodes/scan/keyword-store.ts` is the DB one. */
export interface KeywordStore {
  /** Count one LLM attempt against each listing. */
  bumpKeywordAttempts(listingIds: readonly string[]): Promise<void>;
  /** Find-or-create the keyword and point the listing at it. */
  linkListingKeyword(
    input: LinkListingKeywordInput
  ): Promise<{ keywordId: string }>;
}

export interface LlmStageDeps {
  parse: PhraseParser;
  store: KeywordStore;
}

export interface LlmKeywordTotals {
  /** Batches that errored, answers that never came back, or writes that failed. */
  failed: number;
  resolved: number;
  /** Answered, but the phrase was empty (vague title, bundle, not an item). */
  unresolved: number;
}

export async function runKeywordLlmStage(
  deps: LlmStageDeps,
  marketplace: string,
  listings: readonly UnresolvedListing[]
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
  batch: UnresolvedListing[],
  totals: LlmKeywordTotals
): Promise<void> {
  const items: ExtractItem[] = batch.map((row, index) => ({
    index,
    title: row.title,
    category: row.categoryPath?.join(" > ") ?? null,
  }));

  let answers: Map<number, string>;
  try {
    answers = await extractKeywords(deps.parse, { items });
  } catch (error) {
    logger.warn("Keyword LLM batch failed; attempts counted", {
      marketplace,
      size: batch.length,
      error: errorMessage(error),
    });
    await bumpAttempts(
      deps.store,
      batch.map((row) => row.id)
    );
    totals.failed += batch.length;
    return;
  }

  for (const [index, row] of batch.entries()) {
    await resolveItem(deps, marketplace, row, answers.get(index), totals);
  }
}

async function resolveItem(
  deps: LlmStageDeps,
  marketplace: string,
  row: UnresolvedListing,
  answer: string | undefined,
  totals: LlmKeywordTotals
): Promise<void> {
  if (answer === undefined) {
    logger.warn("Keyword LLM returned no result for listing", {
      listingId: row.id,
      title: row.title,
    });
    await bumpAttempts(deps.store, [row.id]);
    totals.failed += 1;
    return;
  }

  const keyword = answer.trim();
  if (keyword.length === 0) {
    logger.info("Keyword LLM answer", {
      listingId: row.id,
      title: row.title,
      keyword,
      status: "unresolved",
    });
    await bumpAttempts(deps.store, [row.id]);
    totals.unresolved += 1;
    return;
  }

  try {
    const { keywordId } = await deps.store.linkListingKeyword({
      listingId: row.id,
      marketplace,
      keyword,
    });
    logger.info("Keyword LLM answer", {
      listingId: row.id,
      title: row.title,
      keyword,
      keywordId,
      status: "resolved",
    });
    totals.resolved += 1;
  } catch (error) {
    logger.warn("Keyword link failed; attempt counted", {
      listingId: row.id,
      keyword,
      error: errorMessage(error),
    });
    await bumpAttempts(deps.store, [row.id]);
    totals.failed += 1;
  }
}

/** A DB blip while counting an attempt must not escape the stage either. */
async function bumpAttempts(
  store: KeywordStore,
  listingIds: readonly string[]
): Promise<void> {
  try {
    await store.bumpKeywordAttempts(listingIds);
  } catch (error) {
    logger.warn("Could not count keyword attempt", {
      listingIds,
      error: errorMessage(error),
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
