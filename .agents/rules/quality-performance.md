---
title: Performance
impact: MEDIUM
tags: [quality, performance, bundle]
---

## Performance

**Impact: MEDIUM**

- No spread syntax inside loop accumulators (`acc = [...acc, x]` in a loop is O(n²)).
- Lift regex literals to module scope — don't recreate per call.
- Specific imports over namespace imports (`import { x } from 'y'`, not `import * as y`).
- Barrel files: keep only when externally consumed; otherwise remove. (See memory: `feedback_barrel_files`.)
- Use `next/image` over `<img>`.
