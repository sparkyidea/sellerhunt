import { logger } from "@trigger.dev/sdk";
import type { PhraseParser } from "../../keywords/extract-keywords";
import {
  type ListingTitle,
  type LlmKeywordTotals,
  runKeywordLlmStage,
} from "../../keywords/llm-stage";
import { createOpenAIClient } from "../../keywords/openai-client";
import type { ScanConfig } from "../../utils/scan-config";
import { dbKeywordStore } from "./keyword-store";

export type KeywordLlmConfig = Pick<ScanConfig, "keywordLlmEnabled">;

export interface ResolveKeywordsTotals extends LlmKeywordTotals {
  llmSkipped: number;
}

export async function resolveKeywordsWithLlm(
  marketplace: string,
  config: KeywordLlmConfig,
  listings: readonly ListingTitle[],
  parser?: PhraseParser
): Promise<ResolveKeywordsTotals> {
  if (listings.length === 0 || !config.keywordLlmEnabled) {
    return skipped(listings.length);
  }
  let parse = parser;
  if (!parse) {
    try {
      const client = createOpenAIClient();
      parse = (body) => client.responses.parse(body);
    } catch (error) {
      logger.warn("Keyword LLM unavailable; skipping extraction", {
        marketplace,
        pending: listings.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return skipped(listings.length);
    }
  }
  const totals = await runKeywordLlmStage(
    { parse, store: dbKeywordStore },
    marketplace,
    listings
  );
  return { ...totals, llmSkipped: 0 };
}

function skipped(count: number): ResolveKeywordsTotals {
  return { failed: 0, resolved: 0, unresolved: 0, llmSkipped: count };
}
