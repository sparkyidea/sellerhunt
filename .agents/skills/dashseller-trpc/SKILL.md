---
name: dashseller-trpc
description: Use when adding, modifying, or calling tRPC procedures in the dashseller repo. Triggers on "tRPC", "router", "procedure", "appRouter", "useTRPC", or work touching `packages/trpc/src/routers/` or `apps/*/src/lib/utils/trpc/`.
---

# Dashseller tRPC

## Server (`packages/trpc/`)

```
packages/trpc/src/
  index.ts              — exports `router`, `publicProcedure`, `protectedProcedure`, `orgProcedure`
  context.ts            — createContext taking an injected `SessionReader` (ADR 0001)
  routers/
    index.ts            — appRouter aggregator (register new routers here)
    category.ts
    channel.ts
    issue.ts
    listing.ts
    listing-variant.ts
    marketplace.ts
    marketplace-category.ts
    order.ts
    order-line.ts
    product.ts
    product-variant.ts
    scan-listing.ts
    shipment.ts
    stock.ts
    stock-transaction.ts
    sync.ts
    warehouse.ts
    context-search.ts
```

### Adding a procedure

1. Pick the right router file (or create `<entity>.ts` and register in `routers/index.ts`).
2. Use **`orgProcedure`** for anything touching business data — it resolves and exposes `ctx.organizationId`. `protectedProcedure` only when you need a session but no tenant (account-level operations). `publicProcedure` only for unauthenticated reads (rare).
3. Validate inputs with Zod.
4. For listing/table endpoints, accept dataview filter/cursor inputs from `packages/dataview/src/validators/`.
5. Scope every query by `ctx.organizationId`. The organization is the tenant; `ctx.userId` is for `createdByUserId` attribution only, never isolation — rule `TEN-001`.
6. For `getOne` query shape, see `.agents/rules/patterns-trpc-getone-fetching.md`.

### Auth in context

`context.ts` must **not** import the auth server at runtime — it takes a
`SessionReader` the app supplies. `apps/api` passes its in-process reader;
`apps/app` passes one that fetches over HTTP. This is load-bearing: a runtime
import re-expands `apps/app`'s required env surface. See
[ADR 0001](../../../.domain/decisions/0001-app-reads-session-over-http.md).

```ts
// packages/trpc/src/context.ts
import type { authServer } from "@dashseller/auth/auth-server"; // type-only
export type SessionReader = (headers: Headers) => Promise<Session>;

export async function createContext(headers: Headers, getSession: SessionReader) {
  return { session: await getSession(headers) };
}
```

`orgProcedure` then resolves `ctx.organizationId` — the tenant key every
business query scopes on (`TEN-001`).

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

The Hono server in `apps/api/` mounts tRPC at `/trpc`. The Next.js apps (`apps/app`, `apps/web`) talk to it over HTTP — they do **not** mount tRPC themselves.

## Don't

- Don't import `@dashseller/trpc` types into `packages/ui` — UI must stay framework-free.
- Don't add new procedures without input validation.
- Don't bypass `orgProcedure` for business data — `protectedProcedure` alone has no tenant scope (`TEN-001`).
- Don't import `@dashseller/auth/auth-server` at runtime from `packages/trpc` or `apps/app` (ADR 0001).
