# 0002 — Every marketplace write goes through a durable outbox

- **Status:** Accepted
- **Date:** 2026-04-13

## Context

When a seller acts in the dashboard ("ship this order", "drop this price",
"adjust stock"), two systems have to end up agreeing: our DB and the
marketplace. Both naive approaches fail in production.

**Call the marketplace synchronously inside the request.** A network blip means
the user sees an error and retries — and now there are two fulfillments on one
order. A marketplace timeout leaves ambiguous state with no recovery path.

**Write locally and fire-and-forget a background call.** The local DB claims
success the marketplace never confirmed. Drift is invisible until a customer
complains.

## Decision

Local mutations write a row to `sync_outbox` in the same transaction as the
local change. A background worker drains it, walking each row through an
explicit state machine:

```
pending → claimed → reconciling → sending → awaiting_confirmation → confirmed
```

with `failed` / `conflict` / `canceled` / `reconciliation_required` branches.

The pull side reads in-flight outbox rows to avoid stomping local edits mid-push
(**pull protection**). Confirmation is a separate step from sending — a push
isn't done because the HTTP call returned, it's done when a subsequent pull
observes the remote state we intended.

Full mechanics: [`../sync/outbox.md`](../sync/outbox.md).

## Alternatives rejected

- **Synchronous marketplace calls.** Duplicate fulfillments on retry. This is
  the failure that motivated the whole design.
- **Optimistic local write + background push, no confirmation step.** Silent
  drift. "Sent" is not "applied" — marketplaces accept requests they later
  reject.
- **A dedicated `marketplace_fulfillments` table alongside the outbox.** The
  outbox row already records per-order remote state; a parallel table
  duplicates it and immediately starts disagreeing with it.

## Consequences

- Every new (entity, action) pair costs four pieces: push task, fingerprint,
  pull protection, confirmation. Non-negotiable — skipping any one reintroduces
  a failure mode above. The extension checklist is in the systems doc.
- Writes are eventually consistent by construction. UI must show in-flight
  state, not pretend the marketplace already agreed.
- Requires lifecycle schedulers (`drain-sync-outbox`, `dispatch-outbox-recovery`,
  `outbox-stale-reset`, `outbox-sending-sweep`, `outbox-conflict-escalation`,
  `outbox-cleanup`) on the worker's `sync-control` queue. An outbox without
  sweepers wedges on the first lost response.
