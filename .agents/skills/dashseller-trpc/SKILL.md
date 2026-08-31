---
name: dashseller-trpc
description: Use when adding, modifying, or calling tRPC procedures in the dashseller repo. Triggers on "tRPC", "router", "procedure", "appRouter", "useTRPC", or work touching `packages/trpc/src/routers/` or `apps/*/src/lib/utils/trpc/`.
---

# Dashseller tRPC

## Server (`packages/trpc/`)

```
packages/trpc/src/
  index.ts              — exports `router`, `publicProcedure`, `protectedProcedure`
  context.ts            — createContext taking an injected `SessionReader`
  routers/
    index.ts            — appRouter aggregator: { healthCheck, scanListing }
    scan-listing.ts     — the explorer read API (get / getMany / getGroup)
  lib/                  — build-filter/group/rollup/search/sort, schemas
```

### Adding a procedure

1. Pick the right router file (or create `<entity>.ts` and register in `routers/index.ts`).
2. Choose the procedure: `publicProcedure` for unauthenticated reads (the
   explorer's `scanListing` is public); `protectedProcedure` when you need a
   session. There is **no** organization/tenant scoping — orgs were removed.
3. Validate inputs with Zod.
4. For listing/table endpoints, accept dataview filter/cursor inputs from
   `packages/dataview/src/validators/`.
5. For `getOne` query shape, see `.agents/rules/patterns-trpc-getone-fetching.md`.

### Auth in context

`context.ts` must **not** import the auth server at runtime — it takes a
`SessionReader` the app supplies. `apps/api` passes its in-process reader
(`authServer.api.getSession`). This is load-bearing: a runtime import re-expands
the required env surface of any Next.js caller.

```ts
// packages/trpc/src/context.ts
import type { authServer } from "@dashseller/auth/auth-server"; // type-only
export type SessionReader = (headers: Headers) => Promise<Session>;

export async function createContext(headers: Headers, getSession: SessionReader) {
  return { session: await getSession(headers) };
}
```

`protectedProcedure` throws `UNAUTHORIZED` when `ctx.session` is null.

## Client (`apps/app/src/lib/utils/trpc/client.tsx`)

- `useTRPC` hook — Tanstack Query integration via `@trpc/tanstack-react-query`.
- `httpBatchLink` with `credentials: "include"` (sends auth cookies).
- `superjson` transformer (Date / Map / Set serialize correctly).
- `makeQueryClient()` for SSR safety.

### Calling a procedure

- Page-level: `useQuery`.
- Inside dataview table: `useSuspenseQuery`.

(See `dashseller-dataview` skill for the full rule.)

## Where the server runs

The Hono server in `apps/api/` mounts tRPC at `/trpc`. `apps/app` talks to it
over HTTP — it does **not** mount tRPC itself.

## Don't

- Don't import `@dashseller/trpc` types into `packages/ui` — UI must stay framework-free.
- Don't add new procedures without input validation.
- Don't import `@dashseller/auth/auth-server` at runtime from `packages/trpc` or `apps/app` (type-only).
