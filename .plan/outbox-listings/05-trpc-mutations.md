# Part 5 — tRPC mutations: outbox-aware listing writes

## Scope

Two new mutations in `packages/trpc/src/routers/listing.ts` (or wherever
listing writes live today; `listing.ts` is the expected location):

- `listing.updatePrice(input: { listingId, priceMinor, currency })`
- `listing.updateQuantity(input: { listingId, quantity })`

Each:

1. Validates ownership (listing belongs to a channel owned by `ctx.session.user.id`).
2. Inserts a `sync_outbox` row in the same transaction as the local listing
   write.
3. After the transaction commits, triggers `sync-listing-update` with the
   outbox row's id.

## Pattern (modelled on `shipment.create`)

```ts
listing.updatePrice = protectedProcedure
  .input(z.object({
    listingId: z.string().uuid(),
    priceMinor: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }))
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const row = await db.transaction(async (tx) => {
      const [listingRow] = await tx
        .select({ id: listing.id, channelId: listing.channelId })
        .from(listing)
        .where(and(eq(listing.id, input.listingId), eq(listing.userId, userId)))
        .limit(1);
      if (!listingRow) throw new TRPCError({ code: "NOT_FOUND" });

      // Optimistic local write — protected from pull stomp by Part 3
      await tx.update(listing)
        .set({ price: input.priceMinor, currency: input.currency })
        .where(eq(listing.id, listingRow.id));

      const fingerprint = computeListingPriceFingerprint({
        listingId: listingRow.id,
        priceMinor: input.priceMinor,
        currency: input.currency,
      });

      const [outboxRow] = await tx.insert(syncOutbox).values({
        userId,
        channelId: listingRow.channelId,
        entityType: "listing",
        entityId: listingRow.id,
        action: "updateListingPrice",
        payload: { priceMinor: input.priceMinor, currency: input.currency },
        sourceId: null,
        fingerprint,
        status: "pending",
      }).returning({ id: syncOutbox.id });

      return outboxRow;
    });

    await tasks.trigger("sync-listing-update", { outboxId: row.id });
    return { outboxId: row.id };
  });
```

`listing.updateQuantity` is the mirror image with the quantity payload + its
fingerprint helper.

## The unique-blocker index

The `sync_outbox_entity_blocker_idx` partial unique index already guarantees
**one unresolved outbox row per `(entityType, entityId)`**. When a user fires
two consecutive `updatePrice` calls before the first confirms, the second
insert violates the index and Postgres throws `23505`.

Catch and re-throw as a structured tRPC error:

```ts
if (isUniqueViolation(error, "sync_outbox_entity_blocker_idx")) {
  throw new TRPCError({
    code: "CONFLICT",
    message: "A sync operation is already in progress for this listing.",
  });
}
```

The user can resolve via the existing `sync.cancelOutboxRow` mutation (or
wait for the in-flight one to land).

## Optimistic-write rollback

If the push fails terminally (`failOutboxRow`), our local write is now
**ahead** of eBay. Two options:

1. **Roll back automatically** when the row enters `failed` — surface the
   eBay-side current value and rewrite the local row.
2. **Leave it to the user** via the conflict UI — they see "push failed, our
   value: $X, eBay's value: $Y, retry or cancel?".

Option 2 is consistent with the shipment flow (failed shipments don't
rewrite the local DB either). Pick option 2 for v1 — UI work is downstream.
Document this clearly in the mutation's TSDoc.

## Acceptance

- [ ] `listing.updatePrice` and `listing.updateQuantity` exist and are
      protected procedures.
- [ ] Outbox row + local write commit in one transaction.
- [ ] `sync-listing-update` is triggered exactly once per call.
- [ ] Concurrent calls on the same listing return `CONFLICT`, not 500.
- [ ] Listing ownership is enforced; no cross-tenant reads/writes.
- [ ] `fingerprint` is non-null on every inserted row.
