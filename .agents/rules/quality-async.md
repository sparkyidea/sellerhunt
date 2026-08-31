---
title: Async & Promises
impact: HIGH
tags: [quality, async, promises]
---

## Async & Promises

**Impact: HIGH**

- Always `await` promises in async functions — don't drop the return value.
- `async/await` over `.then()` chains.
- Wrap awaits in `try/catch` where errors must be handled.
- Don't use async functions as Promise executors.
