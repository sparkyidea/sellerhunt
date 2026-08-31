---
title: getOne Fetching Strategy (joins vs. separate queries)
impact: HIGH
tags: [patterns, trpc, drizzle, prefetch]
---

## getOne Fetching Strategy

**Impact: HIGH**

A canonical `entity.getOne` is shaped for the entity's own detail page and typically eagerly loads child collections + cross-cutting joins (e.g. `listing.getOne` returns all `listingVariants` + `channel` + `product`). Calling that procedure from a child page just to display a breadcrumb pulls all of it — every cold load, since server prefetch creates a fresh QueryClient per request and never reuses cross-request cache. A 1:1 join in the child's `getOne` returns just the parent row, narrow and exact.

### The rule

> If the related data is reachable via an FK (1:1 relation), join it in `getOne` with Drizzle `with:`. Otherwise (filtered, limited, or aggregated lists), use a separate query.

### Why join 1:1 relations

- One query, one round-trip (vs. two parallel queries).
- Returns just the related row's columns — no cascading eager loads.
- Smaller dehydration payload to ship to the client.
- No URL-param plumbing on the page.

### When you must use a separate query

- Filtered / paginated / limited lists (e.g. "5 most recent sold orders" via `orderLine.getMany` with `filter` + `sort` + `limit`) — these can't be expressed as a Drizzle `with:` clause.
- Aggregations (counts, sums) — same reason.
- Anything that needs its own pagination cursor.

**Incorrect** (over-fetches the canonical parent shape just for a breadcrumb):

```ts
// router — variant has no parent join
getOne: protectedProcedure.input(...).query(({ ctx, input }) =>
  db.query.listingVariant.findFirst({
    where: ...,
    with: { productVariant: true }, // missing listing
  })
);

// page.tsx — separate prefetch pulls listing's full shape
const { listingId, variantId } = await params;
prefetch(trpc.listing.getOne.queryOptions({ id: listingId }));      // pulls
                                  // listingVariants[] + channel + product
prefetch(trpc.listingVariant.getOne.queryOptions({ id: variantId }));

// header.tsx — extra suspense query, extra prop drilling
const { data: listing } = useSuspenseQuery(
  trpc.listing.getOne.queryOptions({ id: listingId })
);
```

**Correct** (1:1 join, single query, narrow shape):

```ts
// router
getOne: protectedProcedure.input(...).query(({ ctx, input }) =>
  db.query.listingVariant.findFirst({
    where: ...,
    with: {
      listing: true,         // 1:1 FK — join
      productVariant: true,  // 1:1 FK — join
    },
  })
);

// page.tsx
const { variantId } = await params;
prefetch(trpc.listingVariant.getOne.queryOptions({ id: variantId }));
prefetch(trpc.listingVariant.getNeighbors.queryOptions({ id: variantId }));

// header.tsx — read listing fields off the variant
parentLabel={variant.listing.title}
href={`/listings/${variant.listingId}/variants/${neighbors.nextId}`}
```

### Mutations and invalidation

When mutating a child entity, invalidate the parent's canonical `getOne` key too if that procedure denormalizes the child (e.g. `product.getOne` returns `productVariants[]`). Joining the parent into the child does not change this — it's a separate cache-shape concern.

The symmetric case applies when child queries denormalize the parent via a 1:1 join: when mutating the parent, also invalidate any child `getOne`/`getMany` keys that include the joined parent fields, otherwise child detail pages can render stale parent metadata within the `staleTime` window. For example, `productVariant.getOne` joins `product`, so `product.update` invalidates `productVariant.getOne`/`getMany` in addition to `product.getOne`/`getMany`.

### Reference

- `apps/app/src/lib/utils/trpc/server.tsx` — `prefetch` implementation, per-request QueryClient via `cache(makeQueryClient)`.
- `apps/app/src/lib/utils/trpc/query-client.ts` — `staleTime` and dehydrate config.
- `packages/trpc/src/routers/listing-variant.ts` — example of the rule applied (joins `listing` and `productVariant`).
- `packages/trpc/src/routers/product-variant.ts` — joins `product` + `stockItems { warehouse }`.
