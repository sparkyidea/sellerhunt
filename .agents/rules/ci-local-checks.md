---
title: Pre-Push Local Checks
impact: HIGH
tags: [ci, pre-push, checks]
---

## Local Checks Before Push

**Impact: HIGH**

Run this sequence before pushing or marking a PR ready-for-review:

```bash
bun check-types          # turbo check-types — TypeScript across the monorepo
bun x ultracite check    # Biome lint + format check
# plus any tests relevant to the touched code:
bun --cwd packages/<pkg> test
```

`lint-staged` runs `bun x ultracite fix` on staged files via the `husky` pre-commit hook, so most format issues self-heal at commit time. The pre-push checks above catch type errors, lint errors that don't auto-fix, and broken tests.

### Order matters

1. **Types first** — broken types hide other failures.
2. **Lint** — many issues auto-fix; re-run check after fix.
3. **Tests** — last because they're slowest.

### When a check fails

Fix the root cause. **Never** silence with `as any`, `// biome-ignore` blanket disables, or `--no-verify`. (See `quality-code-standards.md` and memory: `feedback_no_type_shortcuts`.)
