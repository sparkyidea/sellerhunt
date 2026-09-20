import { scanKeyword } from "@dashseller/db/schema";
import type { KeywordStore } from "../../keywords/llm-stage";
import { db } from "../../utils/db";

export const dbKeywordStore: KeywordStore = {
  async saveKeyword(input) {
    const now = new Date();
    const [keyword] = await db
      .insert(scanKeyword)
      .values({
        marketplace: input.marketplace,
        keyword: input.keyword,
        source: "llm",
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [scanKeyword.marketplace, scanKeyword.keyword],
        set: { lastSeenAt: now },
      })
      .returning({ id: scanKeyword.id });
    if (!keyword) {
      throw new Error("Keyword upsert returned no row");
    }
    return { keywordId: keyword.id };
  },
};
