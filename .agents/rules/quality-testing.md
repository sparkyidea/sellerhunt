---
title: Testing
impact: MEDIUM
tags: [quality, testing, vitest]
---

## Testing

**Impact: MEDIUM**

Test runner: Vitest. Exceptions use `bun:test`:
`packages/trpc/src/lib/__tests__/`, `packages/auth/src/lib/auth/__tests__/`,
and `apps/app/src/app/admin/__tests__/`, and the reusable panel reducer suite at
`packages/ui/src/lib/__tests__/panel-state.test.ts`. The auth and tRPC package `test`
scripts run their suites; run the app layout tests with
`bun test 'apps/app/src/app/admin/__tests__/'` from the repository root.
Router suites in
`packages/trpc/src/routers/__tests__/*.integration.test.ts` are vitest against
the service Postgres via `test:integration`.

- Assertions go inside `it()` / `test()`.
- Async tests use `async/await`, never done callbacks.
- No `.only` / `.skip` in committed code.
- Keep `describe` nesting shallow.
