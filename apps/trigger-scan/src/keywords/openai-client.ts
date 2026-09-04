/**
 * Lazy OpenAI client for keyword extraction. Importing this module never
 * touches the key; only `resolve-keywords-with-llm` calls it, and only when
 * `scan_config.keyword_llm_enabled` is true. Without a key it throws, and
 * the caller skips the batch without spending an attempt.
 */
import { env } from "@dashseller/env/trigger-scan";
import OpenAI from "openai";

const MAX_RETRIES = 2;
const TIMEOUT_MS = 60_000;

export function createOpenAIClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set; configure it or turn off scan_config.keyword_llm_enabled."
    );
  }
  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    maxRetries: MAX_RETRIES,
    timeout: TIMEOUT_MS,
  });
}
