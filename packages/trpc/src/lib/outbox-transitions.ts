import { db } from "@dashseller/db";
import type { SyncOutbox } from "@dashseller/db/schema";
import { syncOutbox } from "@dashseller/db/schema";
import { and, eq, notInArray, sql } from "drizzle-orm";

class OutboxTransitionError extends Error {
  readonly rowId: string;
  readonly expectedStatus: string;

  constructor(rowId: string, expectedStatus: string) {
    super(
      `Outbox row ${rowId} transition failed: expected status [${expectedStatus}] but no matching row found (stale or concurrent claim)`
    );
    this.name = "OutboxTransitionError";
    this.rowId = rowId;
    this.expectedStatus = expectedStatus;
  }
}

function assertUpdated(
  rows: SyncOutbox[],
  id: string,
  expectedStatus: string
): SyncOutbox {
  const row = rows[0];
  if (!row) {
    throw new OutboxTransitionError(id, expectedStatus);
  }
  return row;
}

/**
 * `failed` → `pending`, increment `attempts`, clear `error`, and — per the
 * fenced outbox protocol — bump `claimGeneration` and clear the owner.
 * The caller enqueues `outbox-{rowId}-{newGeneration}` with the RETURNED
 * generation; a retained job from the failed run holds the old one and is
 * fenced out of the re-dispatched row.
 *
 * tRPC-side companion to `redispatchFailedRow` in
 * `packages/sync/src/outbox/fenced.ts`; keep the column sets in sync.
 */
export async function retryOutboxRow(id: string): Promise<SyncOutbox> {
  const rows = await db
    .update(syncOutbox)
    .set({
      status: "pending",
      attempts: sql`${syncOutbox.attempts} + 1`,
      claimedByJob: null,
      claimGeneration: sql`${syncOutbox.claimGeneration} + 1`,
      error: null,
      updatedAt: new Date(),
    })
    .where(and(eq(syncOutbox.id, id), eq(syncOutbox.status, "failed")))
    .returning();

  return assertUpdated(rows, id, "failed");
}

const RESOLVED_STATUSES = ["confirmed", "canceled"] as const;

/**
 * Any unresolved → `canceled`.
 */
export async function cancelOutboxRow(id: string): Promise<SyncOutbox> {
  const rows = await db
    .update(syncOutbox)
    .set({
      status: "canceled",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(syncOutbox.id, id),
        notInArray(syncOutbox.status, [...RESOLVED_STATUSES])
      )
    )
    .returning();

  return assertUpdated(rows, id, "not in (confirmed, canceled)");
}
