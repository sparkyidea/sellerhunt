# Building a Marketplace Push Feature

Guide for adding new outbound (push) operations to marketplaces. Covers the full pipeline from marketplace API wrapper through the sync outbox to the UI.

## Architecture

```
Marketplace SDK    →  eBay API wrapper  →  Adapter (ApiClient)  →  Sandbox test  →  tRPC mutation  →  Sync outbox  →  Trigger.dev task  →  UI
packages/            adapters/ebay/        adapters/ebay/          sandbox/ebay/     packages/trpc/      packages/db/      packages/trigger/    apps/app/
marketplace/         api/                  api/client.ts           adapter/           src/routers/       src/schema/        src/workflows/       src/modules/
src/types.ts                                                                                           sync-outbox.ts
```

## Steps

### Step 1: Define types in the marketplace package

Add request/response types to `packages/marketplace/src/types.ts`.

```ts
// Request payload
export interface CreateShipmentPayload {
  carrier: string;
  lineItems: Array<{ lineItemId: string; quantity: number }>;
  trackingNumber: string;
}

// Response
export interface CreateShipmentResult {
  fulfillmentId: string;
}
```

### Step 2: Add methods to the ApiClient interface

Update `packages/marketplace/src/adapters/base.ts` to declare the new methods on `ApiClient`.

```ts
export interface ApiClient {
  // ... existing methods
  createFulfillment(orderId: string, payload: CreateShipmentPayload): Promise<CreateShipmentResult>;
  getFulfillments(orderId: string): Promise<ShippingFulfillment[]>;
}
```

Always add both the write method and a corresponding read method. The read method is needed for reconciliation (fingerprint matching to prevent duplicates on retry).

### Step 3: Implement the eBay API wrappers

Create files in `packages/marketplace/src/adapters/ebay/api/`:

- `create-<entity>.ts` — the write operation
- `get-<entities>.ts` — the read operation for reconciliation

Key lessons learned:

- **eBay 201 responses return empty bodies.** The resource ID is in the `Location` header. You must temporarily set `returnResponse: true` on the SDK's `apiConfig` to access the full HTTP response with headers. See `create-fulfillment.ts` for the pattern.
- **Map eBay-specific field names** to our normalized types (e.g., `shippingCarrierCode` → `carrier`, `shipmentTrackingNumber` → `trackingNumber`).
- **Handle 404/400 gracefully** in read operations — return empty arrays instead of throwing.

### Step 4: Wire into the eBay client class

Add the methods to `packages/marketplace/src/adapters/ebay/api/client.ts`:

```ts
async createFulfillment(orderId: string, payload: CreateShipmentPayload): Promise<CreateShipmentResult> {
  return await createFulfillment(this.client, orderId, payload);
}
```

Export the new types from `packages/marketplace/src/index.ts`.

### Step 5: Validate with a sandbox adapter test

**This step is mandatory.** Do not proceed to the Trigger.dev task or UI until the adapter test passes against real marketplace data.

Create `packages/marketplace/sandbox/ebay/adapter/<operation-name>.ts`:

```ts
import { createApiClient } from "../../../src";
import { getCredentials } from "../setup";

const channelId = process.env.EBAY_CHANNEL_ID;
if (!channelId) {
  console.error("Set EBAY_CHANNEL_ID");
  process.exit(1);
}

// Use real test data
const ORDER_REF = "18-14468-72876";

const creds = await getCredentials(channelId);
const client = createApiClient("ebay", creds);

// Step A: Read existing state
const existing = await client.getFulfillments(ORDER_REF);
console.log("Existing:", existing);

// Step B: Perform the write operation
const result = await client.createFulfillment(ORDER_REF, { ... });
console.log("Result:", result);

// Step C: Verify by reading again
const after = await client.getFulfillments(ORDER_REF);
console.log("After:", after);

process.exit(0);
```

Run it:

```bash
EBAY_CHANNEL_ID=<id> bun run packages/marketplace/sandbox/ebay/adapter/<operation-name>.ts
```

The test must show:
1. The read method returns data correctly
2. The write method succeeds and returns a non-empty resource ID
3. The verify step confirms the write was applied

Only after all three pass, move to Step 6.

You can also write a `direct-api` sandbox script that uses the raw eBay SDK (`createEbayApiClient`) to inspect the raw HTTP response shape. This is useful for debugging SDK quirks like empty response bodies.

### Step 6: Add the sync outbox entry to the tRPC mutation

The tRPC mutation (e.g., `packages/trpc/src/routers/shipment.ts`) should:

1. Validate input and ownership
2. In a single transaction: insert the entity record + insert a `syncOutbox` row
3. After commit: trigger the Trigger.dev task

```ts
const result = await db.transaction(async (tx) => {
  const [newRecord] = await tx.insert(entity).values({ ... }).returning({ id: entity.id });
  const [outboxRow] = await tx.insert(syncOutbox).values({
    userId,
    channelId,
    entityType: "order",
    entityId: orderRecord.id,
    action: "createFulfillment",
    sourceId: newRecord.id,
    payload,
    fingerprint,
    status: "pending",
  }).returning({ id: syncOutbox.id });
  return { entityId: newRecord.id, outboxId: outboxRow.id };
});

await tasks.trigger("sync-shipment", { outboxId: result.outboxId });
```

### Step 7: Build the Trigger.dev push task

Create `packages/trigger/src/workflows/<task-name>/index.ts`.

The task follows a standard flow:

1. **Claim** — `claimOutboxRow(outboxId)` transitions `pending → claimed`
2. **Reconcile** — `startReconciliation(outboxId)` then fetch remote state via adapter
3. **Fingerprint match** — `findMatchingFulfillment(fingerprint, remoteData)` to detect if already pushed
4. **If match: adopt** — `adoptRemoteObject(outboxId, remoteId, snapshot)` and return early
5. **If no match: send** — `markSending(outboxId)` then call adapter write method
6. **On success** — `markAwaitingConfirmation(outboxId, remoteId)`
7. **On permanent error** — `failOutboxRow(outboxId, errorMsg)`
8. **On retryable error** — `throw error` (let Trigger.dev retry)

Use `TokenManager.loadForChannel(channelId)` to resolve the correct marketplace adapter. This is marketplace-agnostic — do not hardcode eBay-specific logic in the task.

Export the task from `packages/trigger/src/index.ts`:

```ts
export type { syncShipment } from "./workflows/sync-shipment";
```

### Step 8: Build the UI

- Use zustand for dialog open/close state (`useCreateShipment` store)
- Call the tRPC mutation from the dialog
- Invalidate the relevant query on success to refresh the list

### Step 9: Type-check and lint

```bash
bun run check-types
bun x ultracite check
```

## Checklist

- [ ] Types defined in `packages/marketplace/src/types.ts`
- [ ] Methods added to `ApiClient` interface in `adapters/base.ts`
- [ ] eBay API wrappers implemented in `adapters/ebay/api/`
- [ ] eBay client class wired up in `adapters/ebay/api/client.ts`
- [ ] Types exported from `packages/marketplace/src/index.ts`
- [ ] **Sandbox adapter test passes** (`sandbox/ebay/adapter/`)
- [ ] tRPC mutation creates entity + outbox row in one transaction
- [ ] Trigger.dev task follows claim → reconcile → send flow
- [ ] Task exported from `packages/trigger/src/index.ts`
- [ ] Task file lives in `packages/trigger/src/workflows/` (not `nodes/`)
- [ ] UI wired up with zustand state management
- [ ] `bun run check-types` passes
- [ ] `bun x ultracite check` passes

## Common Pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| Empty fulfillment ID | eBay 201 returns empty body, ID is in Location header | Use `returnResponse: true` on SDK apiConfig to access headers |
| Task not found in Trigger.dev | Task file in wrong directory | Must be in `src/workflows/`, not `src/nodes/` |
| sync_outbox insert fails (uuid vs text) | Column type mismatch with entity PK | Use `text()` for `entityId` and `sourceId` in schema |
| Duplicate push on retry | No reconciliation step | Always fetch remote state and fingerprint-match before sending |
| Order lookup fails | Using `orderNumber` instead of `reference` | eBay order IDs are stored in `order.reference` |
