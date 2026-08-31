---
title: Testing
impact: MEDIUM
tags: [quality, testing, vitest]
---

## Testing

**Impact: MEDIUM**

Test runner: Vitest.

- Assertions go inside `it()` / `test()`.
- Async tests use `async/await`, never done callbacks.
- No `.only` / `.skip` in committed code.
- Keep `describe` nesting shallow.
