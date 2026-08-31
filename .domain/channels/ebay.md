# eBay

Live channel. Everything else is measured against it.

## OAuth scopes are pinned in code, and widening them is a migration

`packages/marketplace/src/adapters/ebay/auth/scopes.ts`

The SDK sends the **whole scope list on every token refresh**, and eBay rejects
any scope outside the original consent. So adding one scope invalidates every
connected channel — each seller must reconnect.

**Batch scope additions.** Treat a scope change as a user-visible migration with
a reconnect campaign, never as an incidental commit. Scopes are pinned in code
rather than env so deployments can't diverge into "some channels silently can't
sync."

## Notification (webhook) receiver

Live end to end. Signature verification is in
`adapters/ebay/notification/verify-delivery.ts`.

**Bun cannot do `ssl3-sha1`.** eBay's official Node SDK spells the algorithm
that way; Bun's `createVerify` throws on it, and because the verify call is
inside a try/catch, that failure silently rejects *every genuine notification*.
The portable spelling is `sha1` — identical results, since the aliases differ
only in SSLv3 MAC construction, which doesn't apply here. Don't "fix" it back.

## API gaps and pull-window limits

- **No client-reference echo.** eBay won't round-trip our `outbox.id`, so
  correlation can't use `client_reference` and falls to `tracking_match`.
  Shopify does support the echo. See
  [ADR 0003](../decisions/0003-explicit-fulfillment-correlation.md).
- **First order pull is ~90 days** (API default).
- **`GetSellerList` only sees listings ending in `now → +90d`.** Orders that
  reference already-ended listings keep unresolved references permanently. This
  is expected, not a bug: no variant exists to match, so there's no relink storm
  either.
- **`GetItem` returns a response `Timestamp`** — an exact provider-clock
  observation. It's what makes eBay's seed bounds tight (lower == upper) while
  Shopify's fall back to app clocks. See
  [ADR 0004](../decisions/0004-clean-break-initial-sync.md).
