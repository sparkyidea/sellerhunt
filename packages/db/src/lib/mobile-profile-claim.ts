import { eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  mobileProfile,
  type SelectMobileProfile,
} from "../schema/mobile-profile";
import { isUniqueViolation } from "./pg-errors";

/**
 * A box with no persona takes one from the unassigned pool.
 *
 * One statement, so two boxes racing for the same free row cannot both win:
 * the candidate is locked with `FOR UPDATE SKIP LOCKED`, a concurrent claimer
 * skips past it to the next free row. The lowest-numbered free row goes first,
 * so the pool drains in upload order. A box that already owns a row for the
 * app (assigned, whatever its status) claims nothing — the row-per-box
 * invariant is what `mobile_profile_app_assigned_worker_uidx` enforces, and
 * a dead or cooling persona is the operator's call, not a reason to take a
 * second one.
 *
 * Returns the claimed row, or `null` when nothing is free or the box already
 * has a row. Two runs of the *same* box racing each other are settled by the
 * unique index: the loser's insert into it fails and reads as `null` too, and
 * the caller reloads by hostname.
 *
 * Exported from the db package so the tRPC router's integration test can run
 * the exact statement the worker runs.
 */
export async function claimFreeProfile(
  db: Database,
  app: string,
  hostname: string
): Promise<SelectMobileProfile | null> {
  const candidate = sql`(
    SELECT free.id FROM mobile_profile AS free
    WHERE free.app = ${app}
      AND free.status = 'active'
      AND free.assigned_worker IS NULL
      AND (free.cooldown_until IS NULL OR free.cooldown_until < now())
      AND NOT EXISTS (
        SELECT 1 FROM mobile_profile AS mine
        WHERE mine.app = ${app} AND mine.assigned_worker = ${hostname}
      )
    ORDER BY free.id
    LIMIT 1
    FOR UPDATE OF free SKIP LOCKED
  )`;
  try {
    const [row] = await db
      .update(mobileProfile)
      .set({ assignedWorker: hostname })
      .where(eq(mobileProfile.id, candidate))
      .returning();
    return row ?? null;
  } catch (error) {
    if (isUniqueViolation(error, "mobile_profile_app_assigned_worker_uidx")) {
      return null;
    }
    throw error;
  }
}
