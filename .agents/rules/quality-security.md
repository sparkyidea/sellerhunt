---
title: Security Basics
impact: CRITICAL
tags: [quality, security]
---

## Security

**Impact: CRITICAL**

- `target="_blank"` links must include `rel="noopener"`.
- Avoid `dangerouslySetInnerHTML` unless content is trusted and sanitized.
- No `eval()`. No direct assignment to `document.cookie`.
- Validate user input at boundaries (Zod on tRPC inputs, server route handlers).
- Never log secrets, tokens, or full session payloads.
