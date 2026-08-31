# Decisions

One file per decision that had a real alternative. Sequential numbering, never
reused. **Immutable once shipped** — supersede, never edit.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-app-reads-session-over-http.md) | `apps/app` reads sessions over HTTP, never imports the auth server | Accepted |
| [0002](0002-outbox-for-marketplace-writes.md) | Every marketplace write goes through a durable outbox | Accepted |
| [0003](0003-explicit-fulfillment-correlation.md) | Fulfillment correlation is recorded explicitly, never inferred | Accepted |
| [0004](0004-clean-break-initial-sync.md) | Clean-break initial sync: listings before orders, baseline inventory rule | Accepted |

Template and rules: [`../README.md`](../README.md#writing-an-adr).
