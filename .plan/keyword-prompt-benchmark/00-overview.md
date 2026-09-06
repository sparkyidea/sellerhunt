# keyword-prompt-benchmark

**Goal.** Replace the long keyword-extraction system prompt with the short one,
drop the category from the model input, and add a benchmark (50 real titles
with accepted phrases) so prompt/model/effort changes can be measured.

**Non-goals.** No change to the keyword schema, store, or scan tasks beyond
removing `categoryPath` from the LLM input path.

**Done when.**
- `SYSTEM_PROMPT` is the short prompt; input lines are `[index] title`.
- `bun keywords:bench` runs the fixture and reports match + group consistency.
- `bun run check-types`, `bun run test`, `bun run check` pass.

**Files touched.**
- `apps/trigger-scan/src/keywords/extract-keywords.ts`
- `apps/trigger-scan/src/keywords/llm-stage.ts`
- `apps/trigger-scan/src/nodes/scan/resolve-keywords-with-llm.ts`
- `apps/trigger-scan/scripts/try-keywords.ts`
- `apps/trigger-scan/scripts/bench-keywords.ts` (new)
- `apps/trigger-scan/scripts/keyword-benchmark/` (new fixture + old prompt)
- tests under `apps/trigger-scan/src/keywords/__tests__/`
