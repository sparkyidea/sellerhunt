---
title: Code Standards (Ultracite / Biome)
impact: HIGH
tags: [quality, ultracite, biome, typescript]
---

## Code Standards

**Impact: HIGH**

This project uses **Ultracite**, a zero-config Biome preset. Most issues auto-fix.

- Format: `bun x ultracite fix`
- Check: `bun x ultracite check`
- Diagnose: `bun x ultracite doctor`

### Type Safety

- Explicit types on function params/returns when they aid clarity.
- Prefer `unknown` over `any`. **Never** use `as any` or `as never` to silence the compiler — fix the underlying type. (See memory: `feedback_no_type_shortcuts`.)
- Use `as const` for immutable literals.
- Prefer type narrowing over type assertions.
- Replace magic numbers with named constants.
- **Use `interface` for object shapes.** Reserve `type` for things `interface` can't express — unions, intersections of unrelated shapes, tuples, mapped/conditional types, and primitive aliases. Do not use `type Foo = { ... }` for a plain object shape; write `interface Foo { ... }`.

### Modern JS/TS

- Arrow functions for callbacks and short functions.
- `for...of` over `.forEach()` and indexed `for`.
- Optional chaining (`?.`) and nullish coalescing (`??`).
- Template literals over string concatenation.
- Destructuring for object/array assignments.
- `const` by default, `let` only when reassigning, **never** `var`.

### Code Organization

- Keep functions focused; respect cognitive complexity limits.
- Extract complex conditions into named boolean variables.
- Early returns over nested conditionals.
- No nested ternaries.

### Error Handling

- Throw `Error` objects with descriptive messages — not strings.
- No `console.log` / `debugger` / `alert` in production code.
- Don't catch errors only to rethrow.

### Frameworks

- **Next.js:** use `<Image>`, App Router metadata API, RSC for async data fetching.
- **React 19+:** ref as a prop, not `forwardRef`.
