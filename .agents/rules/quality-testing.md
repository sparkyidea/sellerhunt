---
title: Testing
impact: MEDIUM
tags: [quality, testing, vitest]
---

## Testing

**Impact: MEDIUM**

Test runner: Vitest. Exceptions use `bun:test`:
`packages/trpc/src/lib/__tests__/`, `packages/auth/src/lib/auth/__tests__/`,
and the app's `__tests__` suites. The auth and tRPC package `test`
scripts run their suites; run the app layout tests with
`bun test 'apps/app/src/app/(app)/admin/__tests__/'` from the repository root.
Run the mounted app-shell tests with
`bun test apps/app/src/components/panels/__tests__/app-panels.test.tsx`.
They create a Happy DOM window explicitly; run app suites separately to isolate
their Bun module mocks.
Router suites in
`packages/trpc/src/routers/__tests__/*.integration.test.ts` are vitest against
the service Postgres via `test:integration`.

The UI package uses Vitest for both reducer and mounted React tests. Run them with
`bun --cwd packages/ui test`; mounted tests opt into `happy-dom` per file.

- Assertions go inside `it()` / `test()`.
- Async tests use `async/await`, never done callbacks.
- No `.only` / `.skip` in committed code.
- Keep `describe` nesting shallow.
