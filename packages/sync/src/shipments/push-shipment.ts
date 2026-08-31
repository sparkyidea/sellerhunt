// Rule: SYN-001 — marketplace mutations go through the outbox, never
// direct from a request handler. SYN-004 — this is the reference
// implementation of the four-piece pattern (push / fingerprint / pull
// protection / confirmation); a new (entity, action) pair ships all four.
import { order, shipment } from "@dashseller/db/schema";
import type { ApiClient } from "@dashseller/marketplace/types";
import { getApiErrorStatus } from "@dashseller/marketplace/utils";
import { eq } from "drizzle-orm";
import type { SyncContext } from "../context";
import {
  adoptRemoteObject,
  claimOutboxRow,
  claimRecovery,
  failOutboxRow,
  markAwaitingConfirmation,
  markSending,
  type OutboxClaim,
  resolveRecovery,
  startReconciliation,
} from "../outbox/fenced";
import {
  buildShipmentRemoteSnapshot,
  findMatchingFulfillment,
} from "../outbox/reconciliation";

interface OutboxShipmentPayload {
  carrier: string;
  lineItems: Array<{ lineItemId: string; quantity: number }>;
  tracking: string;
}

/**
 * Marketplace client access for one push. `refresh` swaps in a
 * force-refreshed client after an auth failure — the seam the process
 * shell (Trigger today, apps/worker later) fills with its TokenManager.
 */
export interface ShipmentPushPorts {
  apiClient: ApiClient;
  refreshApiClient(): Promise<ApiClient>;
}

/**
 * Classifies a marketplace API error as auth, permanent, or retryable.
 */
function classifyApiError(error: unknown): "auth" | "permanent" | "retryable" {
  const statusCode = getApiErrorStatus(error);
  if (statusCode === 401) {
    return "auth";
  }
  if (statusCode === 400 || statusCode === 422) {
    return "permanent";
  }
  // 429, timeouts, network errors => retryable
  return "retryable";
}

async function getMarketplaceOrderId(
  ctx: SyncContext,
  entityId: string
): Promise<string> {
  const [row] = await ctx.db
    .select({ reference: order.reference })
    .from(order)
    .where(eq(order.id, entityId))
    .limit(1);
  if (!row?.reference) {
    throw new Error(
      `Order ${entityId} not found or has no marketplace reference`
    );
  }
  return row.reference;
}

export type PushShipmentResult =
  | { action: "adopted" | "created"; fulfillmentId: string }
  | { action: "failed" };

/**
 * Push one shipment outbox row to its marketplace. The full protocol:
 * claim (or resume) → reconcile against remote fulfillments (adopting an
 * existing match) → send → awaiting_confirmation. Every transition is
 * fenced by the claim's generation/owner; a permanent API error fails the
 * row, retryable errors surface to the job runner's retry policy.
 */
export async function pushShipment(
  ctx: SyncContext,
  params: { claim: OutboxClaim; ports: ShipmentPushPorts }
): Promise<PushShipmentResult> {
  const { claim, ports } = params;
  const { row: outboxRow, resumed } = await claimOutboxRow(ctx, claim);
  ctx.logger.info("Claimed outbox row", {
    outboxId: claim.rowId,
    entityId: outboxRow.entityId,
    action: outboxRow.action,
    resumed,
  });

  const payload = outboxRow.payload as OutboxShipmentPayload;
  const marketplaceOrderId = await getMarketplaceOrderId(
    ctx,
    outboxRow.entityId
  );
  let apiClient = ports.apiClient;

  // Reconcile — fetch remote fulfillments. On resume the row may already
  // be in `reconciling`; the transition only fires from `claimed`.
  if (outboxRow.status !== "reconciling") {
    await startReconciliation(ctx, claim);
  }

  let remoteFulfillments: Awaited<ReturnType<ApiClient["getFulfillments"]>>;
  try {
    remoteFulfillments = await apiClient.getFulfillments(marketplaceOrderId);
  } catch (error) {
    if (classifyApiError(error) !== "auth") {
      throw error;
    }
    ctx.logger.warn("Auth error while fetching fulfillments, refreshing", {
      outboxId: claim.rowId,
    });
    apiClient = await ports.refreshApiClient();
    remoteFulfillments = await apiClient.getFulfillments(marketplaceOrderId);
  }

  const localShipment = outboxRow.sourceId
    ? await ctx.db.query.shipment.findFirst({
        where: eq(shipment.id, outboxRow.sourceId),
        columns: { tracking: true },
      })
    : null;

  const match = findMatchingFulfillment(
    outboxRow,
    localShipment ?? null,
    remoteFulfillments
  );

  if (match) {
    ctx.logger.info("Fulfillment already exists remotely, adopting", {
      outboxId: claim.rowId,
      fulfillmentId: match.match.reference,
      correlationMethod: match.method,
    });
    const snapshot = buildShipmentRemoteSnapshot(
      {
        status: "FULFILLED",
        shipped: true,
        shippedAt: match.match.shippedAt,
        deliveredAt: null,
      },
      match.match
    );
    await adoptRemoteObject(ctx, claim, match.match.reference, snapshot, {
      correlationMethod: match.method,
    });
    return { action: "adopted", fulfillmentId: match.match.reference };
  }

  await markSending(ctx, claim);

  let retried = false;
  const attemptCreate = async (): Promise<string> => {
    try {
      const result = await apiClient.createFulfillment(marketplaceOrderId, {
        tracking: payload.tracking,
        carrier: payload.carrier,
        lineItems: payload.lineItems,
        clientReferenceId: claim.rowId,
      });
      return result.fulfillmentId;
    } catch (error: unknown) {
      const classification = classifyApiError(error);
      if (classification === "auth" && !retried) {
        retried = true;
        ctx.logger.warn("Auth error, refreshing token and retrying", {
          outboxId: claim.rowId,
        });
        apiClient = await ports.refreshApiClient();
        return await attemptCreate();
      }
      if (classification === "permanent") {
        const errorMsg = error instanceof Error ? error.message : String(error);
        ctx.logger.error("Permanent API error, failing outbox row", {
          outboxId: claim.rowId,
          error: errorMsg,
        });
        await failOutboxRow(ctx, claim, errorMsg);
        return "";
      }
      // retryable (429, timeout, network) or auth after retry — surface to
      // the job runner's retry policy.
      throw error;
    }
  };

  const fulfillmentId = await attemptCreate();
  if (!fulfillmentId) {
    return { action: "failed" };
  }

  await markAwaitingConfirmation(ctx, claim, fulfillmentId, {
    correlationMethod: "remote_id",
  });

  if (outboxRow.sourceId) {
    // Marketplace accepted the fulfillment; the package is handed to the
    // carrier as of now. Carrier-side updates come via the tracking poller.
    await ctx.db
      .update(shipment)
      .set({ reference: fulfillmentId, shippedAt: new Date() })
      .where(eq(shipment.id, outboxRow.sourceId));
  }

  ctx.logger.info("Shipment created, awaiting confirmation", {
    outboxId: claim.rowId,
    fulfillmentId,
  });
  return { action: "created", fulfillmentId };
}

export type RecoverShipmentResult = "confirmed" | "redispatched" | "conflict";

/**
 * `recover-outbox` core: a send timed out mid-flight and nobody knows
 * whether it landed. Claim the recovery (CAS on owner+generation), search
 * the remote side, and resolve:
 * - a fulfillment matches (client reference or tracking) → the send DID
 *   land → `confirmed`
 * - the full fulfillment list is retrievable and contains no match →
 *   absence positively established → back to `pending` for re-dispatch
 * - the remote search itself fails → ambiguous → `conflict`
 */
export async function recoverShipmentPush(
  ctx: SyncContext,
  params: { claim: Required<OutboxClaim>; ports: ShipmentPushPorts }
): Promise<RecoverShipmentResult> {
  const { claim, ports } = params;
  const row = await claimRecovery(ctx, claim);
  const marketplaceOrderId = await getMarketplaceOrderId(ctx, row.entityId);

  let remoteFulfillments: Awaited<ReturnType<ApiClient["getFulfillments"]>>;
  try {
    let apiClient = ports.apiClient;
    try {
      remoteFulfillments = await apiClient.getFulfillments(marketplaceOrderId);
    } catch (error) {
      if (classifyApiError(error) !== "auth") {
        throw error;
      }
      apiClient = await ports.refreshApiClient();
      remoteFulfillments = await apiClient.getFulfillments(marketplaceOrderId);
    }
  } catch (error) {
    const details = `remote search failed during recovery: ${
      error instanceof Error ? error.message : String(error)
    }`;
    ctx.logger.error("Outbox recovery ambiguous", {
      outboxId: claim.rowId,
      details,
    });
    await resolveRecovery(ctx, claim, { kind: "ambiguous", details });
    return "conflict";
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
    remoteFulfillments
  );

  if (match) {
    await resolveRecovery(ctx, claim, {
      kind: "found",
      externalRef: match.match.reference,
      correlationMethod: match.method,
      remoteSnapshot: buildShipmentRemoteSnapshot(
        {
          status: "FULFILLED",
          shipped: true,
          shippedAt: match.match.shippedAt,
          deliveredAt: null,
        },
        match.match
      ),
    });
    ctx.logger.info("Recovery: timed-out send had landed — confirmed", {
      outboxId: claim.rowId,
      fulfillmentId: match.match.reference,
    });
    return "confirmed";
  }

  await resolveRecovery(ctx, claim, { kind: "absent" });
  ctx.logger.info("Recovery: send absent remotely — re-dispatched", {
    outboxId: claim.rowId,
  });
  return "redispatched";
}
