import { shipment } from "@dashseller/db/schema";
import type { ApiClient, Order } from "@dashseller/marketplace/types";
import { eq } from "drizzle-orm";
import type { SyncContext } from "../context";
import type { OrdersUpsertPorts } from "../orders/upsert-orders";
import { confirmOutboxRow, OutboxTransitionError } from "./fenced";
import {
  getInFlightOutboxRows,
  getProtectedEntityIds,
  type InFlightOutboxRow,
} from "./protection";
import {
  buildShipmentRemoteSnapshot,
  findMatchingFulfillment,
  type ShippingFulfillment,
} from "./reconciliation";

/**
 * How long a push may stay unevidenced before "no match yet" stops being
 * a retryable condition. Marketplace listing endpoints lag their write
 * side, so a fresh row with no visible fulfillment is normal — the run
 * reports a deferred error and the retry / watermark machinery re-checks.
 * Past this window the run stops erroring (a genuinely vanished remote
 * fulfillment must not hold the channel watermark hostage) and the
 * 60-minute conflict sweep stays the bounded escalation.
 */
const EVIDENCE_RETRY_WINDOW_MS = 30 * 60 * 1000;

/**
 * Production wiring for {@link OrdersUpsertPorts} — the pull side of the
 * outbox protocol. Protection keeps a marketplace pull from stomping
 * fields whose push is still in flight; evidence capture closes the loop
 * by confirming `awaiting_confirmation` rows once the remote fulfillment
 * list proves the push landed. Without this wiring nothing ever calls
 * `confirmOutboxRow`, and `outbox-conflict-escalation` turns every
 * successful push into a conflict after an hour.
 */
export function createOrdersUpsertPorts(
  ctx: SyncContext,
  apiClient: ApiClient
): OrdersUpsertPorts {
  return {
    getProtectedEntityIds: (orderIds) =>
      getProtectedEntityIds(ctx, "order", orderIds),
    captureRemoteEvidence: (protectedOrderIds, existingOrders, orders) =>
      confirmAwaitingRows(ctx, apiClient, {
        existingOrders,
        orders,
        protectedOrderIds,
      }),
  };
}

/**
 * Never throws: order ingestion must not fail because a confirmation
 * could not be attempted. Failures come back as run errors instead, so
 * the caller's existing retry / watermark-holdback path re-runs them
 * before the 60-minute conflict sweep can escalate a landed push.
 */
async function confirmAwaitingRows(
  ctx: SyncContext,
  apiClient: ApiClient,
  params: {
    existingOrders: Array<{ id: string; reference: string | null }>;
    orders: Order[];
    protectedOrderIds: Set<string>;
  }
): Promise<Array<{ error: string; reference: string }>> {
  if (params.protectedOrderIds.size === 0) {
    return [];
  }

  const referenceByOrderId = new Map<string, string>();
  for (const existing of params.existingOrders) {
    if (existing.reference !== null) {
      referenceByOrderId.set(existing.id, existing.reference);
    }
  }

  let awaiting: InFlightOutboxRow[];
  try {
    const inFlight = await getInFlightOutboxRows(ctx, "order", [
      ...params.protectedOrderIds,
    ]);
    awaiting = inFlight.filter((row) => row.status === "awaiting_confirmation");
  } catch (error) {
    // The lookup itself failed — no row is known, so report it against
    // every protected order rather than losing the whole pull.
    const message = describe(error);
    ctx.logger.warn("In-flight outbox lookup failed; confirmation deferred", {
      error: message,
    });
    return [...params.protectedOrderIds].map((orderId) => ({
      reference: referenceByOrderId.get(orderId) ?? orderId,
      error: `outbox confirmation deferred: ${message}`,
    }));
  }
  if (awaiting.length === 0) {
    return [];
  }

  const pulledByReference = new Map(
    params.orders.map((pulled) => [pulled.reference, pulled])
  );
  const fulfillmentsByReference = new Map<string, ShippingFulfillment[]>();
  const deferred: Array<{ error: string; reference: string }> = [];

  for (const row of awaiting) {
    const reference = referenceByOrderId.get(row.entityId);
    if (!reference) {
      continue;
    }
    try {
      let fulfillments = fulfillmentsByReference.get(reference);
      if (!fulfillments) {
        fulfillments = await apiClient.getFulfillments(reference);
        fulfillmentsByReference.set(reference, fulfillments);
      }
      const outcome = await confirmIfEvidenced(ctx, {
        fulfillments,
        pulledOrder: pulledByReference.get(reference),
        row,
      });
      if (outcome === "no-evidence") {
        // A successful read with no match is NOT success: the listing
        // endpoint may simply lag the push. While the row is young this
        // must fail the run so the retry machinery re-checks before the
        // sweep can escalate a landed push; past the window we go quiet
        // and leave escalation to the sweep.
        const age = ctx.clock.now().getTime() - row.updatedAt.getTime();
        if (age < EVIDENCE_RETRY_WINDOW_MS) {
          deferred.push({
            reference,
            error: `outbox confirmation pending: pushed fulfillment not yet visible for order ${reference}`,
          });
        } else {
          ctx.logger.warn(
            "Pushed fulfillment still not visible remotely — leaving to the conflict sweep",
            { outboxId: row.id, ageMs: age }
          );
        }
      }
    } catch (error) {
      if (error instanceof OutboxTransitionError) {
        // The row moved on under us (re-dispatch, sweep, concurrent
        // confirm) — whoever moved it owns it now, so this is not a
        // failure and must not hold the watermark back.
        continue;
      }
      const message = describe(error);
      ctx.logger.warn("Remote evidence capture failed; confirmation deferred", {
        outboxId: row.id,
        error: message,
      });
      deferred.push({
        reference,
        error: `outbox confirmation deferred: ${message}`,
      });
    }
  }
  return deferred;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function confirmIfEvidenced(
  ctx: SyncContext,
  params: {
    fulfillments: ShippingFulfillment[];
    pulledOrder: Order | undefined;
    row: InFlightOutboxRow;
  }
): Promise<"confirmed" | "no-evidence"> {
  const { fulfillments, pulledOrder, row } = params;
  // Fence on the generation read alongside the row: if a sweep re-claims
  // the row before this lands, the confirm no-ops instead of resurrecting
  // a re-dispatched push.
  const claim = { rowId: row.id, generation: row.claimGeneration };

  // The push response already named this fulfillment (`remote_id`
  // correlation) — seeing it on the listing endpoint is direct proof, no
  // matching ladder needed.
  const byExternalRef =
    row.externalRef === null
      ? undefined
      : fulfillments.find((f) => f.reference === row.externalRef);
  if (byExternalRef) {
    await confirmOutboxRow(
      ctx,
      claim,
      buildEvidenceSnapshot(pulledOrder, byExternalRef)
    );
    ctx.logger.info("Pull evidence confirmed outbox row", {
      outboxId: row.id,
      fulfillmentId: byExternalRef.reference,
    });
    return "confirmed";
  }

  const localShipment = row.sourceId
    ? await ctx.db.query.shipment.findFirst({
        where: eq(shipment.id, row.sourceId),
        columns: { tracking: true },
      })
    : null;
  const match = findMatchingFulfillment(
    row,
    localShipment ?? null,
    fulfillments
  );
  if (!match) {
    return "no-evidence";
  }
  await confirmOutboxRow(
    ctx,
    claim,
    buildEvidenceSnapshot(pulledOrder, match.match),
    { correlationMethod: match.method }
  );
  ctx.logger.info("Pull evidence confirmed outbox row", {
    outboxId: row.id,
    fulfillmentId: match.match.reference,
    correlationMethod: match.method,
  });
  return "confirmed";
}

function buildEvidenceSnapshot(
  pulledOrder: Order | undefined,
  matched: ShippingFulfillment
) {
  return buildShipmentRemoteSnapshot(
    {
      status: pulledOrder?.status ?? "FULFILLED",
      shipped: pulledOrder?.shipped ?? true,
      shippedAt: pulledOrder?.shippedAt?.toISOString() ?? matched.shippedAt,
      deliveredAt: pulledOrder?.deliveredAt?.toISOString() ?? null,
    },
    matched
  );
}
