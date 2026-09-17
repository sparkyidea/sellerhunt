---
name: dashseller-trpc
description: Use when adding, modifying, or calling tRPC procedures in the dashseller repo. Triggers on "tRPC", "router", "procedure", "appRouter", "useTRPC", or work touching `packages/trpc/src/routers/` or `apps/*/src/lib/utils/trpc/`.
---

# Dashseller tRPC

## Server (`packages/trpc/`)

```
packages/trpc/src/
  index.ts              — exports `router`, `publicProcedure`, `protectedProcedure`, `adminProcedure`, `permissionProcedure(perms)`, `createCallerFactory`
  context.ts            — createContext taking an injected `SessionReader` + `ContextOptions` (encryption key)
  routers/
    index.ts            — appRouter aggregator: { healthCheck, scanListing, mobileProfile }
    scan-listing.ts     — the explorer read API (get / getMany / getGroup)
    mobile-profile.ts   — admin CRUD over the persona pool (`permissionProcedure({ mobileProfile: [verb] })`)
  lib/                  — build-filter/group/rollup/search/sort, schemas
```

### Adding a procedure

1. Pick the right router file (or create `<entity>.ts` and register in `routers/index.ts`).
2. Choose the procedure: `publicProcedure` for unauthenticated reads (the
   explorer's `scanListing` is public); `protectedProcedure` when you need a
   session; `permissionProcedure({ <resource>: [<verb>] })` for admin
   resources — verbs come from `packages/auth/src/lib/auth/permissions.ts`
   (`statement`), add the resource there first; `adminProcedure` only for
   "any admin at all" surfaces. There is **no** organization/tenant scoping —
   orgs were removed.
3. Validate inputs with Zod.
4. For listing/table endpoints, accept dataview filter/cursor inputs from
   `packages/dataview/src/validators/`.
5. For `getOne` query shape, see `.agents/rules/patterns-trpc-getone-fetching.md`.

### Auth in context

`context.ts` must **not** import the auth server or a deployment env at
runtime — it takes a `SessionReader` and `ContextOptions` the app supplies.
`apps/api` passes its in-process reader (`authServer.api.getSession`) and
`env.ENCRYPTION_SECRET`. This is load-bearing: a runtime import re-expands the
required env surface of any Next.js caller.

```ts
// packages/trpc/src/context.ts
import type { authServer } from "@dashseller/auth/auth-server"; // type-only
export type SessionReader = (headers: Headers) => Promise<Session>;
export interface ContextOptions { encryptionKey: string }

export async function createContext(headers: Headers, getSession: SessionReader, options: ContextOptions) {
  return { session: await getSession(headers), encryptionKey: options.encryptionKey };
}
```

`protectedProcedure` throws `UNAUTHORIZED` when `ctx.session` is null;
`adminProcedure` and `permissionProcedure` additionally throw `FORBIDDEN` for
banned users and for roles without the admin role / the requested statement.

### Tests

- `packages/trpc/src/lib/__tests__/` — `bun:test`, run by `bun --cwd packages/trpc test`.
- `packages/trpc/src/routers/__tests__/*.integration.test.ts` — vitest against
  the service Postgres (`bun test:docker:up`, then
  `bun --cwd packages/trpc test:integration`). Use
  `createCallerFactory(appRouter)({ session, encryptionKey })` with a fake
  session to exercise authorization without HTTP.

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
- Don't import `@dashseller/auth/auth-server` at runtime from `packages/trpc` or the Next.js apps (type-only).
