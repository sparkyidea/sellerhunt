import type { CorrelationMethod, SyncOutbox } from "@dashseller/db/schema";
import { syncOutbox } from "@dashseller/db/schema";
import { and, eq, inArray, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import type { SyncContext } from "../context";

/**
 * Identity of a mutation attempt against an outbox row.
 *
 * Fenced mode (BullMQ era): `generation` comes from the job payload
 * (`outbox-{rowId}-{generation}`) and `jobId` is the STABLE job id — not
 * the per-attempt lock token, so retries of the same job resume their own
 * claim. Every mutation predicates on both; a stale retained job holding
 * an older generation can never claim or mutate a re-dispatched row.
 *
 * Legacy mode (Trigger window): omit `generation`/`jobId` — transitions
 * fence on status alone, exactly the pre-P8 behavior, and never touch the
 * fencing columns. The two modes coexist until P15/P16 retire the legacy
 * producers.
 */
export interface OutboxClaim {
  generation?: number;
  jobId?: string;
  rowId: string;
}

export class OutboxTransitionError extends Error {
  readonly expectedStatus: string | string[];
  readonly rowId: string;

  constructor(rowId: string, expectedStatus: string | string[]) {
    const expected = Array.isArray(expectedStatus)
      ? expectedStatus.join(", ")
      : expectedStatus;
    super(
      `Outbox row ${rowId} transition failed: expected status [${expected}] but no matching row found (stale generation, stale status, or concurrent claim)`
    );
    this.name = "OutboxTransitionError";
    this.rowId = rowId;
    this.expectedStatus = expectedStatus;
  }
}

function assertUpdated(
  rows: SyncOutbox[],
  id: string,
  expectedStatus: string | string[]
): SyncOutbox {
  const row = rows[0];
  if (!row) {
    throw new OutboxTransitionError(id, expectedStatus);
  }
  return row;
}

function fence(claim: OutboxClaim, ...conditions: (SQL | undefined)[]): SQL {
  const parts: (SQL | undefined)[] = [
    eq(syncOutbox.id, claim.rowId),
    ...conditions,
  ];
  if (claim.generation !== undefined) {
    parts.push(eq(syncOutbox.claimGeneration, claim.generation));
  }
  const combined = and(...parts);
  if (!combined) {
    throw new Error("empty fence");
  }
  return combined;
}

/** Owner predicate for post-claim transitions (fenced mode only). */
function ownedBy(claim: OutboxClaim): SQL | undefined {
  return claim.jobId === undefined
    ? undefined
    : eq(syncOutbox.claimedByJob, claim.jobId);
}

/**
 * `pending` → `claimed` (sets owner, increments attempts). Fenced callers
 * that lose the race but already own the row in `claimed`/`reconciling` —
 * a retry of the same job — RESUME it instead of failing.
 */
export async function claimOutboxRow(
  ctx: SyncContext,
  claim: OutboxClaim
): Promise<{ resumed: boolean; row: SyncOutbox }> {
  const rows = await ctx.db
    .update(syncOutbox)
    .set({
      status: "claimed",
      attempts: sql`${syncOutbox.attempts} + 1`,
      ...(claim.jobId === undefined ? {} : { claimedByJob: claim.jobId }),
      updatedAt: new Date(),
    })
    .where(fence(claim, eq(syncOutbox.status, "pending")))
    .returning();
  const claimed = rows[0];
  if (claimed) {
    return { resumed: false, row: claimed };
  }

  if (claim.jobId !== undefined && claim.generation !== undefined) {
    const [resumable] = await ctx.db
      .select()
      .from(syncOutbox)
      .where(
        fence(
          claim,
          inArray(syncOutbox.status, ["claimed", "reconciling"]),
          eq(syncOutbox.claimedByJob, claim.jobId)
        )
      )
      .limit(1);
    if (resumable) {
      return { resumed: true, row: resumable };
    }
  }

  throw new OutboxTransitionError(claim.rowId, "pending");
}

/** `claimed` → `reconciling` */
export async function startReconciliation(
  ctx: SyncContext,
  claim: OutboxClaim
): Promise<SyncOutbox> {
  const rows = await ctx.db
    .update(syncOutbox)
    .set({ status: "reconciling", updatedAt: new Date() })
    .where(fence(claim, eq(syncOutbox.status, "claimed"), ownedBy(claim)))
    .returning();
  return assertUpdated(rows, claim.rowId, "claimed");
}

/** `reconciling` → `sending`, set `pushedAt` */
export async function markSending(
  ctx: SyncContext,
  claim: OutboxClaim
): Promise<SyncOutbox> {
  const now = new Date();
  const rows = await ctx.db
    .update(syncOutbox)
    .set({ status: "sending", pushedAt: now, updatedAt: now })
    .where(fence(claim, eq(syncOutbox.status, "reconciling"), ownedBy(claim)))
    .returning();
  return assertUpdated(rows, claim.rowId, "reconciling");
}

/**
 * `sending` → `awaiting_confirmation`.
 *
 * Rule: SYN-002 — a push is NOT done here. `confirmed` comes only from a
 * later pull observing the state we intended; marketplaces accept
 * requests they later reject.
 * When `externalRef` is provided, the push response gave us a fulfillment
 * ID directly — callers should also pass `correlationMethod: "remote_id"`
 * so the audit label is written in the same atomic update.
 */
export async function markAwaitingConfirmation(
  ctx: SyncContext,
  claim: OutboxClaim,
  externalRef?: string,
  options: { correlationMethod?: CorrelationMethod } = {}
): Promise<SyncOutbox> {
  const rows = await ctx.db
    .update(syncOutbox)
    .set({
      status: "awaiting_confirmation",
      ...(externalRef !== undefined && { externalRef }),
      ...(options.correlationMethod !== undefined && {
        correlationMethod: options.correlationMethod,
      }),
      updatedAt: new Date(),
    })
    .where(fence(claim, eq(syncOutbox.status, "sending"), ownedBy(claim)))
    .returning();
  return assertUpdated(rows, claim.rowId, "sending");
}

/**
 * `awaiting_confirmation` → `confirmed`, set `confirmedAt`.
 *
 * Rule: SYN-002 — reached from observation, never from a 2xx response.
 */
export async function confirmOutboxRow(
  ctx: SyncContext,
  claim: OutboxClaim,
  remoteSnapshot?: unknown,
  options: { correlationMethod?: CorrelationMethod } = {}
): Promise<SyncOutbox> {
  const now = new Date();
  const rows = await ctx.db
    .update(syncOutbox)
    .set({
      status: "confirmed",
      confirmedAt: now,
      updatedAt: now,
      ...(remoteSnapshot !== undefined && { remoteSnapshot }),
      ...(options.correlationMethod !== undefined && {
        correlationMethod: options.correlationMethod,
      }),
    })
    .where(fence(claim, eq(syncOutbox.status, "awaiting_confirmation")))
    .returning();
  return assertUpdated(rows, claim.rowId, "awaiting_confirmation");
}

/**
 * `reconciling` → `confirmed` — the push already exists remotely; adopt it.
 */
export async function adoptRemoteObject(
  ctx: SyncContext,
  claim: OutboxClaim,
  externalRef: string,
  remoteSnapshot: unknown,
  options: { correlationMethod?: CorrelationMethod } = {}
): Promise<SyncOutbox> {
  const now = new Date();
  const rows = await ctx.db
    .update(syncOutbox)
    .set({
      status: "confirmed",
      externalRef,
      remoteSnapshot,
      reconciledAt: now,
      confirmedAt: now,
      updatedAt: now,
      ...(options.correlationMethod !== undefined && {
        correlationMethod: options.correlationMethod,
      }),
    })
    .where(fence(claim, eq(syncOutbox.status, "reconciling"), ownedBy(claim)))
    .returning();
  return assertUpdated(rows, claim.rowId, "reconciling");
}

const ACTIVE_STATUSES = [
  "pending",
  "claimed",
  "reconciling",
  "sending",
  "awaiting_confirmation",
] as const;

/** Any active state → `failed`, set `error`. */
export async function failOutboxRow(
  ctx: SyncContext,
  claim: OutboxClaim,
  error: string
): Promise<SyncOutbox> {
  const owner =
    claim.jobId === undefined
      ? undefined
      : or(
          isNull(syncOutbox.claimedByJob),
          eq(syncOutbox.claimedByJob, claim.jobId)
        );
  const rows = await ctx.db
    .update(syncOutbox)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(
      fence(claim, inArray(syncOutbox.status, [...ACTIVE_STATUSES]), owner)
    )
    .returning();
  return assertUpdated(rows, claim.rowId, [...ACTIVE_STATUSES]);
}

/** `awaiting_confirmation` → `conflict`, set error details. */
export async function markConflict(
  ctx: SyncContext,
  claim: OutboxClaim,
  details: string
): Promise<SyncOutbox> {
  const rows = await ctx.db
    .update(syncOutbox)
    .set({ status: "conflict", error: details, updatedAt: new Date() })
    .where(fence(claim, eq(syncOutbox.status, "awaiting_confirmation")))
    .returning();
  return assertUpdated(rows, claim.rowId, "awaiting_confirmation");
}

// ---------------------------------------------------------------------------
// Durable `sending` recovery — two steps, per the outbox protocol.
// ---------------------------------------------------------------------------

/**
 * Step 1 (control plane, transition only — never enqueues): `sending` rows
 * whose send has been in flight past the timeout can neither be confirmed
 * nor retried blindly — the push may or may not have landed. Move them to
 * `reconciliation_required`, clear the owner, and bump the generation so
 * the original sender (which may still be alive) is fenced out.
 */
export async function sweepSendingTimeouts(
  ctx: SyncContext,
  params: { olderThan: Date }
): Promise<SyncOutbox[]> {
  return await ctx.db
    .update(syncOutbox)
    .set({
      status: "reconciliation_required",
      claimedByJob: null,
      claimGeneration: sql`${syncOutbox.claimGeneration} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(syncOutbox.status, "sending"),
        lt(syncOutbox.updatedAt, params.olderThan)
      )
    )
    .returning();
}

/**
 * Step 2 scan (control plane, each tick): unowned `reconciliation_required`
 * rows to enqueue as `recover-outbox-{rowId}-{generation}` jobs. A failed
 * enqueue self-heals — the row stays unowned and the next tick re-scans it.
 */
export async function listRecoverableRows(
  ctx: SyncContext,
  limit: number
): Promise<Array<{ claimGeneration: number; id: string }>> {
  return await ctx.db
    .select({ id: syncOutbox.id, claimGeneration: syncOutbox.claimGeneration })
    .from(syncOutbox)
    .where(
      and(
        eq(syncOutbox.status, "reconciliation_required"),
        isNull(syncOutbox.claimedByJob)
      )
    )
    .limit(limit);
}

/**
 * Recovery claim CAS: `reconciliation_required` with a matching generation
 * and no owner (or already owned by this same job — retries resume).
 * Status does NOT change; owning the row is what serializes recovery.
 */
export async function claimRecovery(
  ctx: SyncContext,
  claim: Required<OutboxClaim>
): Promise<SyncOutbox> {
  const rows = await ctx.db
    .update(syncOutbox)
    .set({ claimedByJob: claim.jobId, updatedAt: new Date() })
    .where(
      fence(
        claim,
        eq(syncOutbox.status, "reconciliation_required"),
        or(
          isNull(syncOutbox.claimedByJob),
          eq(syncOutbox.claimedByJob, claim.jobId)
        )
      )
    )
    .returning();
  return assertUpdated(rows, claim.rowId, "reconciliation_required");
}

export type RecoveryOutcome =
  | {
      correlationMethod?: CorrelationMethod;
      externalRef: string;
      kind: "found";
      remoteSnapshot?: unknown;
    }
  /** Remote absence positively established — safe to re-dispatch the push. */
  | { kind: "absent" }
  /** Could not establish either way — a human must look. */
  | { details: string; kind: "ambiguous" };

/**
 * Resolve a claimed recovery:
 * - found     → `confirmed` (the timed-out send actually landed)
 * - absent    → `pending`, generation++, owner cleared (safe re-dispatch)
 * - ambiguous → `conflict`
 */
export async function resolveRecovery(
  ctx: SyncContext,
  claim: Required<OutboxClaim>,
  outcome: RecoveryOutcome
): Promise<SyncOutbox> {
  const now = new Date();
  const where = fence(
    claim,
    eq(syncOutbox.status, "reconciliation_required"),
    eq(syncOutbox.claimedByJob, claim.jobId)
  );

  if (outcome.kind === "found") {
    const rows = await ctx.db
      .update(syncOutbox)
      .set({
        status: "confirmed",
        externalRef: outcome.externalRef,
        confirmedAt: now,
        reconciledAt: now,
        updatedAt: now,
        ...(outcome.remoteSnapshot !== undefined && {
          remoteSnapshot: outcome.remoteSnapshot,
        }),
        ...(outcome.correlationMethod !== undefined && {
          correlationMethod: outcome.correlationMethod,
        }),
      })
      .where(where)
      .returning();
    return assertUpdated(rows, claim.rowId, "reconciliation_required");
  }

  if (outcome.kind === "absent") {
    const rows = await ctx.db
      .update(syncOutbox)
      .set({
        status: "pending",
        claimedByJob: null,
        claimGeneration: sql`${syncOutbox.claimGeneration} + 1`,
        updatedAt: now,
      })
      .where(where)
      .returning();
    return assertUpdated(rows, claim.rowId, "reconciliation_required");
  }

  const rows = await ctx.db
    .update(syncOutbox)
    .set({
      status: "conflict",
      error: outcome.details,
      updatedAt: now,
    })
    .where(where)
    .returning();
  return assertUpdated(rows, claim.rowId, "reconciliation_required");
}

/**
 * Stale reset (control plane): rows stuck mid-claim past the timeout go
 * back to dispatchable with the generation bumped — the original job, if
 * it ever wakes, is fenced out of the re-dispatched row. Covers both
 * ordinary claims (`claimed`/`reconciling` → `pending`) and stale
 * RECOVERY claims (`reconciliation_required` with an owner → owner
 * cleared, still `reconciliation_required`).
 */
export async function resetStaleClaims(
  ctx: SyncContext,
  params: { olderThan: Date }
): Promise<{ claims: SyncOutbox[]; recoveries: SyncOutbox[] }> {
  const claims = await ctx.db
    .update(syncOutbox)
    .set({
      status: "pending",
      claimedByJob: null,
      claimGeneration: sql`${syncOutbox.claimGeneration} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(syncOutbox.status, ["claimed", "reconciling"]),
        lt(syncOutbox.updatedAt, params.olderThan)
      )
    )
    .returning();

  const recoveries = await ctx.db
    .update(syncOutbox)
    .set({
      claimedByJob: null,
      claimGeneration: sql`${syncOutbox.claimGeneration} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(syncOutbox.status, "reconciliation_required"),
        sql`${syncOutbox.claimedByJob} IS NOT NULL`,
        lt(syncOutbox.updatedAt, params.olderThan)
      )
    )
    .returning();

  return { claims, recoveries };
}

/**
 * Manual/failed retry: `failed` → `pending`, generation++, owner cleared.
 * The caller enqueues `outbox-{rowId}-{newGeneration}` with the RETURNED
 * generation — a retained job from the failed run holds the old one and
 * can no longer touch the row.
 */
export async function redispatchFailedRow(
  ctx: SyncContext,
  rowId: string
): Promise<SyncOutbox> {
  const rows = await ctx.db
    .update(syncOutbox)
    .set({
      status: "pending",
      claimedByJob: null,
      claimGeneration: sql`${syncOutbox.claimGeneration} + 1`,
      error: null,
      updatedAt: new Date(),
    })
    .where(and(eq(syncOutbox.id, rowId), eq(syncOutbox.status, "failed")))
    .returning();
  return assertUpdated(rows, rowId, "failed");
}

/** Drainer scan: `pending` rows to (re-)enqueue, oldest first. */
export async function listPendingRows(
  ctx: SyncContext,
  limit: number
): Promise<Array<{ claimGeneration: number; id: string }>> {
  return await ctx.db
    .select({ id: syncOutbox.id, claimGeneration: syncOutbox.claimGeneration })
    .from(syncOutbox)
    .where(eq(syncOutbox.status, "pending"))
    .orderBy(syncOutbox.createdAt)
    .limit(limit);
}
