---
title: React & JSX Conventions
impact: HIGH
tags: [quality, react, jsx, accessibility]
---

## React & JSX

**Impact: HIGH**

- Function components only.
- Hooks at the top level — never conditional.
- All deps in hook dependency arrays.
- `key` on iterables — prefer stable IDs over array indices.
- Children nest between tags, not as props.
- Don't define components inside other components (causes remounts and broken memoization).

### Accessibility (semantic HTML + ARIA)

- Meaningful `alt` on images.
- Proper heading hierarchy.
- Labels for form inputs.
- Keyboard handlers alongside mouse handlers.
- Use `<button>`, `<nav>` etc. — not `<div role="button">`.
