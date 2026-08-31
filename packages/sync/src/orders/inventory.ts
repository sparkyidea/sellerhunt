import {
  orderLineInventoryState,
  stock,
  stockTransaction,
} from "@dashseller/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { recordSyncConflict } from "../conflicts";
import type { SyncContext } from "../context";

/**
 * Inventory input for one order line, derived entirely from provider
 * line-level data (never order-level status):
 * - `activeQuantity` — current inventory-relevant quantity after edits and
 *   cancellations (adapter contract, P2/P4).
 * - `targetFulfilled` — remote cumulative fulfilled quantity, summed from
 *   normalized fulfillments (`deriveFulfilledQuantities`). NULL means the
 *   fulfillment state is UNKNOWN for this snapshot (not fetched) — the
 *   applied counter stands in, so a cancellation can still release the
 *   outstanding remainder without ever un-fulfilling shipped units.
 */
export interface OrderLineEffectInput {
  activeQuantity: number;
  channelId: string;
  /** Provider transition id (e.g. fulfillment id) when available. */
  effectRef: string | null;
  /**
   * Order-level provider placement time, for the baseline rule. eBay can
   * produce Invalid Date — always validated via `getTime()` before use,
   * never trusted.
   */
  orderedAt: Date | null;
  /**
   * Line quantity as originally placed (`OrderLine.quantity`). With
   * `activeQuantity`/`targetFulfilled` it derives the units the
   * marketplace RESTORED to availability (cancel/edit) — needed at first
   * application of a pre-seed order whose restore happened after the seed
   * observation, where the restore is otherwise invisible.
   */
  orderedQuantity: number | null;
  orderLineId: string;
  organizationId: string;
  productVariantId: string;
  /**
   * Order-level provider modification clock (`Order.sourceVersionAt`).
   * Classifies a restore as pre- or post-seed: the last modification of a
   * canceled/edited order is at or after the restore, and it shares the
   * provider clock with the seed cutoff.
   */
  sourceVersionAt: Date | null;
  targetFulfilled: number | null;
  /** From `order_line.warehouse_id` when the line names a warehouse. */
  warehouseId: string | null;
}

export type OrderLineEffectOutcome =
  | {
      kind: "applied";
      baselineUplift: number;
      conflictsRecorded: number;
      deltas: EffectDeltas;
    }
  | { kind: "no-op"; conflictsRecorded: number }
  | { kind: "no-stock"; conflictsRecorded: number }
  | { kind: "conflict"; conflictsRecorded: number; reason: string };

export interface EffectDeltas {
  fulfilled: number;
  released: number;
  reserved: number;
}

interface AppliedCounters {
  fulfilled: number;
  released: number;
  reserved: number;
}

/**
 * Target-fulfillment delta derivation (handles simultaneous fulfillment +
 * quantity change):
 *
 *   effectiveFulfilled   = max(targetFulfilled ?? appliedFulfilled, appliedFulfilled)
 *   Δfulfilled           = effectiveFulfilled − appliedFulfilled
 *   projectedOutstanding = appliedReserved − effectiveFulfilled − appliedReleased
 *   targetOutstanding    = max(0, activeQuantity − effectiveFulfilled)
 *   adjustment           = targetOutstanding − projectedOutstanding
 *   adjustment > 0 → Δreserved = adjustment
 *   adjustment < 0 → Δreleased = −adjustment
 *
 * Counters are cumulative and monotonic, so the applied counter is a floor
 * on the fulfillment clock: a target below it (shrinking remote cumulative)
 * is flagged, never applied, and the invariant
 * `fulfilled + released ≤ reserved` is clamped as a final defense.
 * Re-deriving from the same snapshot yields all-zero deltas.
 */
export function deriveEffectDeltas(
  applied: AppliedCounters,
  target: { activeQuantity: number; targetFulfilled: number | null }
): {
  deltas: EffectDeltas;
  invariantClamped: boolean;
  monotonicityViolated: boolean;
} {
  // A remote cumulative that went DOWN is provider data we don't trust —
  // counters never decrease; the applied value stands in.
  const monotonicityViolated =
    target.targetFulfilled !== null &&
    target.targetFulfilled < applied.fulfilled;
  const effectiveFulfilled = Math.max(
    target.targetFulfilled ?? applied.fulfilled,
    applied.fulfilled
  );
  const fulfilled = effectiveFulfilled - applied.fulfilled;

  const projectedOutstanding =
    applied.reserved - effectiveFulfilled - applied.released;
  const targetOutstanding = Math.max(
    0,
    target.activeQuantity - effectiveFulfilled
  );
  const adjustment = targetOutstanding - projectedOutstanding;

  let reserved = adjustment > 0 ? adjustment : 0;
  let released = adjustment < 0 ? -adjustment : 0;

  // Final defense for the plan invariant fulfilled + released ≤ reserved:
  // never release more than the line's true outstanding.
  const nextReserved = applied.reserved + reserved;
  const nextFulfilled = applied.fulfilled + fulfilled;
  const nextReleased = applied.released + released;
  const excess = nextFulfilled + nextReleased - nextReserved;
  let invariantClamped = false;
  if (excess > 0 && released > 0) {
    const cut = Math.min(released, excess);
    released -= cut;
    invariantClamped = true;
  }
  // If fulfillment alone exceeds reservation, cover it with reservation —
  // a fulfillment implies the stock was claimed, reserved or not.
  const residual =
    applied.fulfilled +
    fulfilled +
    applied.released +
    released -
    (applied.reserved + reserved);
  if (residual > 0) {
    reserved += residual;
    invariantClamped = true;
  }

  return {
    deltas: { fulfilled, reserved, released },
    invariantClamped,
    monotonicityViolated,
  };
}

type Tx = Parameters<Parameters<SyncContext["db"]["transaction"]>[0]>[0];

/** Applied counters plus the writer-less restocked column (return flow). */
interface AppliedState extends AppliedCounters {
  restocked: number;
}

function isZeroDeltas(deltas: EffectDeltas): boolean {
  return (
    deltas.reserved === 0 && deltas.fulfilled === 0 && deltas.released === 0
  );
}

function isFirstApplication(applied: AppliedState): boolean {
  return (
    applied.reserved === 0 &&
    applied.fulfilled === 0 &&
    applied.released === 0 &&
    applied.restocked === 0
  );
}

/**
 * Units the marketplace already restored to availability (cancel or
 * quantity edit) by the time of the line's FIRST application — invisible
 * to the derived deltas, which only see the current active/fulfilled
 * state. Zero when fulfillment state is unknown (never guess a restore)
 * or on any later application (the counters carry the history by then).
 *
 * Rule: INV-001 — guessing a restore would hold more stock than reality.
 */
function deriveRestoredUnits(
  applied: AppliedState,
  input: OrderLineEffectInput
): number {
  if (
    !isFirstApplication(applied) ||
    input.orderedQuantity === null ||
    input.targetFulfilled === null
  ) {
    return 0;
  }
  return Math.max(
    0,
    input.orderedQuantity -
      Math.max(input.activeQuantity, input.targetFulfilled)
  );
}

/**
 * Resolve which stock row this line's effects apply to. Warehouse-aware:
 * when the line names a warehouse, only that warehouse's row qualifies.
 * Multiple candidates with no disambiguator is a conflict — never pick an
 * arbitrary row.
 *
 * Rule: INV-006.
 */
async function resolveStockRow(
  tx: Tx,
  input: OrderLineEffectInput
): Promise<
  { kind: "ok"; stockId: string } | { kind: "none" } | { kind: "ambiguous" }
> {
  const conditions = [
    eq(stock.organizationId, input.organizationId),
    eq(stock.productVariantId, input.productVariantId),
  ];
  if (input.warehouseId) {
    conditions.push(eq(stock.warehouseId, input.warehouseId));
  }
  const candidates = await tx
    .select({ id: stock.id })
    .from(stock)
    .where(and(...conditions))
    .limit(2);

  if (candidates.length === 0) {
    return { kind: "none" };
  }
  if (candidates.length > 1) {
    return { kind: "ambiguous" };
  }
  const only = candidates[0];
  if (!only) {
    return { kind: "none" };
  }
  return { kind: "ok", stockId: only.id };
}

/**
 * Lock (and if needed first create) this line's inventory-state row — the
 * narrow per-line serialization point carrying both the stock pin and the
 * applied counters. A pre-existing row — live writer or operator fix —
 * always wins; resolution runs only when no row exists yet, so a
 * hand-resolved multi-stock line keeps working even though a fresh
 * resolution would be ambiguous. On an ambiguous resolution NO row is
 * inserted — the conflict leaves no state behind.
 */
async function lockInventoryState(
  tx: Tx,
  input: OrderLineEffectInput
): Promise<
  | { kind: "ok"; stockId: string; applied: AppliedState }
  | { kind: "no-stock" }
  | { kind: "conflict"; reason: string }
> {
  const readLocked = async () => {
    const [row] = await tx
      .select({
        stockId: orderLineInventoryState.stockId,
        reserved: orderLineInventoryState.appliedReservedQuantity,
        fulfilled: orderLineInventoryState.appliedFulfilledQuantity,
        released: orderLineInventoryState.appliedReleasedQuantity,
        restocked: orderLineInventoryState.appliedRestockedQuantity,
      })
      .from(orderLineInventoryState)
      .where(eq(orderLineInventoryState.orderLineId, input.orderLineId))
      .for("update");
    return row ?? null;
  };
  const toOk = (row: NonNullable<Awaited<ReturnType<typeof readLocked>>>) =>
    ({
      kind: "ok",
      stockId: row.stockId,
      applied: {
        reserved: row.reserved,
        fulfilled: row.fulfilled,
        released: row.released,
        restocked: row.restocked,
      },
    }) as const;

  const existing = await readLocked();
  if (existing) {
    return toOk(existing);
  }

  const resolved = await resolveStockRow(tx, input);
  if (resolved.kind === "ambiguous") {
    return {
      kind: "conflict",
      reason: "multiple candidate stock rows and no warehouse disambiguator",
    };
  }
  if (resolved.kind === "none") {
    return { kind: "no-stock" };
  }

  await tx
    .insert(orderLineInventoryState)
    .values({
      orderLineId: input.orderLineId,
      stockId: resolved.stockId,
      organizationId: input.organizationId,
    })
    .onConflictDoNothing();
  // Re-read under lock: on a race, the winner's stockId AND counters are
  // adopted together — the PK-conflict wait means this read sees the
  // winner's committed increments, never a half-applied mix.
  const afterInsert = await readLocked();
  if (!afterInsert) {
    return { kind: "no-stock" };
  }
  return toOk(afterInsert);
}

/**
 * One counter-increment UPDATE on the state row, then `stock_transaction`
 * ledger rows for nonzero deltas. A positive `baselineUplift` adds an
 * `adjust` row so the ledger identity
 * `receive + adjust + return − fulfill = stock.quantity` keeps holding on
 * the baseline path.
 */
async function writeStateAndLedger(
  tx: Tx,
  input: OrderLineEffectInput,
  stockId: string,
  deltas: EffectDeltas,
  baselineUplift: number
): Promise<void> {
  await tx
    .update(orderLineInventoryState)
    .set({
      appliedReservedQuantity: sql`${orderLineInventoryState.appliedReservedQuantity} + ${deltas.reserved}`,
      appliedFulfilledQuantity: sql`${orderLineInventoryState.appliedFulfilledQuantity} + ${deltas.fulfilled}`,
      appliedReleasedQuantity: sql`${orderLineInventoryState.appliedReleasedQuantity} + ${deltas.released}`,
    })
    .where(eq(orderLineInventoryState.orderLineId, input.orderLineId));

  const ledgerRows: Array<{
    effectRef: string | null;
    note: string;
    orderLineId: string;
    organizationId: string;
    quantity: number;
    stockId: string;
    type: "adjust" | "fulfill" | "release" | "reserve";
  }> = (
    [
      { legacyType: "reserve", delta: deltas.reserved },
      { legacyType: "fulfill", delta: deltas.fulfilled },
      { legacyType: "release", delta: deltas.released },
    ] as const
  )
    .filter((row) => row.delta > 0)
    .map((row) => ({
      organizationId: input.organizationId,
      stockId,
      orderLineId: input.orderLineId,
      type: row.legacyType,
      quantity: row.delta,
      note: "Order sync effect",
      effectRef: input.effectRef,
    }));
  if (baselineUplift > 0) {
    ledgerRows.push({
      organizationId: input.organizationId,
      stockId,
      orderLineId: input.orderLineId,
      type: "adjust",
      quantity: baselineUplift,
      note: "Baseline uplift: order predates marketplace stock observation",
      effectRef: input.effectRef,
    });
  }
  if (ledgerRows.length > 0) {
    await tx.insert(stockTransaction).values(ledgerRows);
  }
}

/**
 * Baseline decision + net stock arithmetic for the one stock update. An
 * order placed before the stock row's seed observation is already netted
 * out of the marketplace-available seed, so its outstanding portion is
 * reserved WITHOUT draining availability and its fulfilled portion is
 * ledger-only: `quantityDelta = Δreserved − Δfulfilled` instead of
 * `−Δfulfilled`. On the baseline path both stock deltas are ≥ 0 by
 * construction (Δreserved ≥ Δfulfilled when counters start at zero), so
 * the clamp/oversell conflicts never fire there.
 *
 * Restore awareness: units the marketplace already gave back (cancel or
 * quantity edit — `restoredUnits`) are invisible to the derived deltas at
 * first application. When the restore happened AFTER the seed observation
 * (`restorePostSeed` — the seed still excluded those units), they join
 * the deltas as reserved+released history, which flows the restore into
 * the uplift while leaving the net reservation unchanged. A pre-seed
 * restore is already inside the seed and adds nothing.
 *
 * Rule: INV-007 — pre-seed orders uplift, never deduct. INV-002 for what
 * the seeded quantity means.
 */
function planStockUpdate(params: {
  applied: AppliedState;
  deltas: EffectDeltas;
  orderedAtValid: boolean;
  orderLineId: string;
  restoredUnits: number;
  sourceVersionAtValid: boolean;
  stockId: string;
  stockRow: {
    orderPredatesSeed: boolean;
    quantity: number;
    reservedQuantity: number;
    restorePostSeed: boolean;
    seedBasis: string | null;
  };
}): {
  baselineUplift: number;
  conflicts: Array<{ entity: string; entityId: string; reason: string }>;
  effectiveDeltas: EffectDeltas;
  nextQuantity: number;
  nextReserved: number;
} {
  const { applied, deltas, stockRow } = params;
  const conflicts: Array<{
    entity: string;
    entityId: string;
    reason: string;
  }> = [];

  let baseline = false;
  if (
    isFirstApplication(applied) &&
    stockRow.seedBasis === "listing_available"
  ) {
    if (params.orderedAtValid) {
      baseline = stockRow.orderPredatesSeed;
    } else {
      conflicts.push({
        entity: "orderLine",
        entityId: params.orderLineId,
        reason:
          "orderedAt missing or invalid on seeded stock — baseline rule skipped; availability may double-count this line",
      });
    }
  }

  let effectiveDeltas = deltas;
  if (baseline && params.restoredUnits > 0) {
    if (!params.sourceVersionAtValid) {
      conflicts.push({
        entity: "orderLine",
        entityId: params.orderLineId,
        reason:
          "restore timing unknown (no provider modification clock) — restored units not uplifted; availability may understate",
      });
    } else if (stockRow.restorePostSeed) {
      effectiveDeltas = {
        reserved: deltas.reserved + params.restoredUnits,
        fulfilled: deltas.fulfilled,
        released: deltas.released + params.restoredUnits,
      };
    }
  }

  const baselineUplift = baseline ? effectiveDeltas.reserved : 0;
  const reservedDelta =
    effectiveDeltas.reserved -
    effectiveDeltas.fulfilled -
    effectiveDeltas.released;
  const quantityDelta = baseline
    ? effectiveDeltas.reserved - effectiveDeltas.fulfilled
    : -effectiveDeltas.fulfilled;
  const nextReservedRaw = stockRow.reservedQuantity + reservedDelta;
  const nextReserved = Math.max(0, nextReservedRaw);
  const nextQuantity = stockRow.quantity + quantityDelta;
  if (nextReservedRaw < 0) {
    conflicts.push({
      entity: "stock",
      entityId: params.stockId,
      reason: `reservedQuantity clamped at 0 (would be ${nextReservedRaw}) applying order line ${params.orderLineId}`,
    });
  }
  if (nextQuantity < 0) {
    conflicts.push({
      entity: "stock",
      entityId: params.stockId,
      reason: `quantity went negative (${nextQuantity}) applying order line ${params.orderLineId} — oversell`,
    });
  }
  return {
    baselineUplift,
    conflicts,
    effectiveDeltas,
    nextQuantity,
    nextReserved,
  };
}

/**
 * Read and lock the line's stock row, resolving both seed comparisons
 * SQL-side on purpose: `timestamp` columns round-trip into JS shifted by
 * the host UTC offset (see the run-marker rationale in
 * sync-channel-listings.ts), and both sides here are UTC-naive.
 *
 * NO KEY UPDATE, not FOR UPDATE: a sibling transaction inserting its
 * inventory-state row holds an FK KEY SHARE on this stock row, and an
 * exclusive request here forms a lock-queue cycle with that sibling's own
 * later stock lock.
 *
 * Rule: INV-004 — comparisons stay SQL-side.
 */
async function lockStockRow(
  tx: Tx,
  params: {
    orderedAtIso: string | null;
    sourceVersionAtIso: string | null;
    stockId: string;
  }
) {
  const [row] = await tx
    .select({
      id: stock.id,
      quantity: stock.quantity,
      reservedQuantity: stock.reservedQuantity,
      seedBasis: stock.seedBasis,
      orderPredatesSeed: params.orderedAtIso
        ? sql<boolean>`${stock.seedObservedAt} IS NOT NULL AND ${params.orderedAtIso}::timestamp < ${stock.seedObservedAt}`
        : sql<boolean>`false`,
      // Compared against the UPPER observation bound: a restore inside the
      // fetch window may already be in the seed, so it classifies pre-seed
      // (undersell, never oversell). Rule: INV-001, INV-003.
      restorePostSeed: params.sourceVersionAtIso
        ? sql<boolean>`${stock.seedObservedUpperAt} IS NOT NULL AND ${params.sourceVersionAtIso}::timestamp > ${stock.seedObservedUpperAt}`
        : sql<boolean>`false`,
    })
    .from(stock)
    .where(eq(stock.id, params.stockId))
    .for("no key update");
  return row ?? null;
}

/**
 * Apply one order line's inventory effects. One transaction, in the fixed
 * recipe order:
 *
 *   1. lock-or-create the inventory-state row (pre-existing row wins) —
 *      the narrow per-line serialization point, carrying pin + counters
 *   2. derive deltas from (applied counters, target snapshot)
 *   3. one net stock update (stock row locked FOR NO KEY UPDATE;
 *      reservedQuantity clamped at 0 with a conflict record; negative
 *      quantity allowed but recorded), applying the baseline rule when
 *      this is the line's first application against seeded stock and the
 *      order predates the seed observation
 *   4. counter increments + stock_transaction ledger rows (effect_ref set)
 *
 * Baseline rule: an order placed before the stock row's seed observation
 * is already netted out of the marketplace-available seed, so its
 * outstanding portion is reserved WITHOUT draining availability and its
 * fulfilled portion is ledger-only — `quantityDelta = Δreserved −
 * Δfulfilled` instead of `−Δfulfilled`, with the uplift recorded as an
 * `adjust` ledger row. Units the marketplace restored (cancel/edit)
 * after the seed observation join the uplift as reserved+released
 * history — see `planStockUpdate`.
 *
 * Conflicts (ambiguous stock, clamps, monotonicity violations, skipped
 * baseline) are recorded per-domain and never abort sibling lines.
 */
export async function applyOrderLineEffects(
  ctx: SyncContext,
  input: OrderLineEffectInput
): Promise<OrderLineEffectOutcome> {
  // Conflicts observed mid-transaction are recorded AFTER commit: writing
  // them through a second pooled connection while this one holds row locks
  // invites pool exhaustion under concurrency, and the clamped result is
  // committed either way.
  const pendingConflicts: Array<{
    entity: string;
    entityId: string;
    reason: string;
  }> = [];
  const orderedAtIso =
    input.orderedAt !== null && !Number.isNaN(input.orderedAt.getTime())
      ? input.orderedAt.toISOString()
      : null;
  const sourceVersionAtIso =
    input.sourceVersionAt !== null &&
    !Number.isNaN(input.sourceVersionAt.getTime())
      ? input.sourceVersionAt.toISOString()
      : null;
  const outcome = await ctx.db.transaction(
    async (tx): Promise<OrderLineEffectOutcome> => {
      // 1. Inventory state: lock the pin + applied counters in one row.
      const state = await lockInventoryState(tx, input);
      if (state.kind === "conflict") {
        return {
          kind: "conflict",
          reason: state.reason,
          conflictsRecorded: 0,
        };
      }
      if (state.kind === "no-stock") {
        // No stock row exists for this variant anywhere we're allowed to
        // look — nothing to apply against. Not a conflict: channels without
        // local inventory tracking land here on every sync.
        return { kind: "no-stock", conflictsRecorded: 0 };
      }
      const { applied } = state;

      // 2. Derive.
      const { deltas, invariantClamped, monotonicityViolated } =
        deriveEffectDeltas(applied, {
          activeQuantity: input.activeQuantity,
          targetFulfilled: input.targetFulfilled,
        });
      if (monotonicityViolated) {
        pendingConflicts.push({
          entity: "orderLine",
          entityId: input.orderLineId,
          reason: `remote cumulative fulfilled decreased below applied counter (${input.targetFulfilled} < ${applied.fulfilled})`,
        });
      }
      if (invariantClamped) {
        pendingConflicts.push({
          entity: "orderLine",
          entityId: input.orderLineId,
          reason:
            "effect deltas clamped to keep fulfilled + released <= reserved",
        });
      }
      // Units the marketplace restored to availability (cancel/edit)
      // before we ever saw the line — only relevant at first application,
      // and only decidable once the stock row's seed provenance is read.
      const restoredUnits = deriveRestoredUnits(applied, input);
      if (isZeroDeltas(deltas) && restoredUnits === 0) {
        return { kind: "no-op", conflictsRecorded: pendingConflicts.length };
      }

      // 3. One net stock update, under the stock row lock so the clamp is
      // exact even when sibling lines share the row — see `lockStockRow`.
      const stockRow = await lockStockRow(tx, {
        orderedAtIso,
        sourceVersionAtIso,
        stockId: state.stockId,
      });
      if (!stockRow) {
        return { kind: "no-stock", conflictsRecorded: pendingConflicts.length };
      }

      const plan = planStockUpdate({
        applied,
        deltas,
        orderedAtValid: orderedAtIso !== null,
        orderLineId: input.orderLineId,
        restoredUnits,
        sourceVersionAtValid: sourceVersionAtIso !== null,
        stockId: state.stockId,
        stockRow,
      });
      pendingConflicts.push(...plan.conflicts);
      const { effectiveDeltas } = plan;
      if (isZeroDeltas(effectiveDeltas)) {
        // Restored candidate that turned out to need nothing (unseeded
        // stock, post-seed order, or a pre-seed restore already inside
        // the seed).
        return { kind: "no-op", conflictsRecorded: pendingConflicts.length };
      }
      if (plan.nextQuantity < 0) {
        ctx.logger.warn("stock quantity went negative", {
          stockId: state.stockId,
          orderLineId: input.orderLineId,
          quantity: plan.nextQuantity,
        });
      }
      await tx
        .update(stock)
        .set({
          quantity: plan.nextQuantity,
          reservedQuantity: plan.nextReserved,
        })
        .where(eq(stock.id, stockRow.id));

      // 4. Counter increments + ledger rows.
      await writeStateAndLedger(
        tx,
        input,
        state.stockId,
        effectiveDeltas,
        plan.baselineUplift
      );

      return {
        kind: "applied",
        deltas: effectiveDeltas,
        baselineUplift: plan.baselineUplift,
        conflictsRecorded: pendingConflicts.length,
      };
    }
  );

  if (outcome.kind === "conflict") {
    pendingConflicts.push({
      entity: "orderLine",
      entityId: input.orderLineId,
      reason: outcome.reason,
    });
  }
  for (const conflict of pendingConflicts) {
    await recordSyncConflict(ctx, {
      channelId: input.channelId,
      domain: "orders",
      organizationId: input.organizationId,
      ...conflict,
    });
  }
  return { ...outcome, conflictsRecorded: pendingConflicts.length };
}
