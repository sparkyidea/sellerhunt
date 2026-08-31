# Shopify

Adapter and webhook path work; not wired into all UI flows.

## Webhook subscriptions

`packages/marketplace/src/adapters/shopify/notification/`

- **`WebhookSubscriptionInput` has no `apiVersion` field.** The version comes
  from the client, pinned in `create-shopify-client.ts` — changing Shopify API
  versions is a deliberate migration, not a config toggle.
- **`WebhookSubscriptionTopic` spelling is an API boundary value only.** Admin
  GraphQL accepts only that spelling on the write side. Never store it, never
  compare against it outside the topics module — the neutral
  `NotificationEventType` is what the rest of the system uses.
- **Shopify deletes a subscription after repeated delivery failures.** A
  subscription that vanishes is not necessarily one we removed; reconciliation
  has to be able to re-create it.
- A topic our access scopes can't hold is a **property of the install**, not a
  failure to retry.
- Unhandled topics are archived as `ignored` on arrival rather than waking a
  worker.

## Adapter caveats

- **Supports `client_reference` echo**, so it correlates one rung higher on the
  ladder than eBay. [ADR 0003](../decisions/0003-explicit-fulfillment-correlation.md)
- **SKU-collision variant references** — a known, pre-existing caveat. Shopify
  variant identity derived from SKU collides when a shop reuses SKUs across
  products.
- **No provider observation clock on listings**, so initial-sync seed bounds
  fall back to app clocks captured before/after the page fetch. Residual
  minutes-scale skew, biased toward undersell.
  [ADR 0004](../decisions/0004-clean-break-initial-sync.md)
