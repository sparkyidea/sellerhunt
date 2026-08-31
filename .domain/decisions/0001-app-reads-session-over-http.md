# 0001 — `apps/app` reads sessions over HTTP, never imports the auth server

- **Status:** Accepted
- **Date:** 2026-05-22

## Context

Moving `apps/app` to call the tRPC router in-process (`createCaller` /
`createTRPCOptionsProxy`) pulled `@dashseller/auth/auth-server` into its import
graph via `packages/trpc/src/context.ts`.

Better Auth constructs eagerly — social providers and email handlers are wired
at module load. So importing it forced `apps/app` to validate every var
`env/auth.ts` reads (`RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_*`, `DISCORD_*`)
even though `apps/app` never signs anyone in and never sends mail.

The stopgap was marking those vars `.optional()`. That defeated the point of
validation: the code that actually reads them stopped crashing when they were
missing, trading a fail-fast boot error for a silent runtime failure.

## Decision

`packages/trpc/src/context.ts` takes a `SessionReader` function as an argument
instead of importing `auth`. Each app supplies its own:

- **`apps/api`** — in-process: `(headers) => auth.api.getSession({ headers })`
- **`apps/app`** — HTTP: fetches `apps/api`'s `/api/auth/get-session`,
  forwarding the session cookie from `next/headers`

The `Session` type is still sourced from `@dashseller/auth/auth-server` via
`import type`, which is erased at compile time and never enters the runtime
graph.

Auth lives in `apps/api`. Full stop.

## Alternatives rejected

- **Keep the `.optional()` env vars.** Converts a loud boot failure into a
  quiet production one. The validation boundary only means something if the
  vars a package actually reads are required.
- **Duplicate a minimal Better Auth instance in `apps/app`.** Two auth
  configurations that must stay in sync; the drift is a security bug waiting to
  happen.
- **Pass resolved session data as props from RSC everywhere (Cal.com's
  approach).** Valid, and it dodges the problem entirely — but it means giving
  up the prefetch + `HydrationBoundary` pattern the dataview relies on for
  smooth pagination.

## Consequences

- `apps/app`'s required env shrinks to `NEXT_PUBLIC_APP_URL`,
  `NEXT_PUBLIC_API_URL`, `DATABASE_URL`, `ENCRYPTION_SECRET`. DB stays because
  in-process tRPC procedures still touch it.
- `env/auth.ts` integration vars are **required** again. Honest validation.
- Session reads from `apps/app` cost a network hop to `apps/api`. Deduplicated
  per RSC request with React `cache()`.
- **This constraint is load-bearing and easy to break by accident.** Any new
  runtime import of `@dashseller/auth/auth-server` from `apps/app` silently
  re-expands its env surface. See
  [`.agents/rules/architecture-env-validation-boundaries.md`](../../.agents/rules/architecture-env-validation-boundaries.md).
