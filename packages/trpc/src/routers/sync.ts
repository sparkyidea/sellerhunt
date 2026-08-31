import { db } from "@dashseller/db";
import { syncOutbox } from "@dashseller/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { orgProcedure, router } from "../index";
import { cancelOutboxRow, retryOutboxRow } from "../lib/outbox-transitions";

/**
 * Verify the outbox row belongs to the authenticated organization before performing
 * any mutation. Returns the row if ownership is confirmed.
 */
async function verifyOwnership(organizationId: string, outboxId: string) {
  const [row] = await db
    .select({ id: syncOutbox.id, status: syncOutbox.status })
    .from(syncOutbox)
    .where(
      and(
        eq(syncOutbox.id, outboxId),
        eq(syncOutbox.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Outbox row not found",
    });
  }

  return row;
}

export const syncRouter = router({
  /**
   * Retry a failed outbox row: `failed` -> `pending`
   */
  retryOutboxRow: orgProcedure
    .input(z.object({ outboxId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = ctx.organizationId;
      const existing = await verifyOwnership(organizationId, input.outboxId);

      if (existing.status !== "failed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot retry: row is in "${existing.status}" status, expected "failed"`,
        });
      }

      const updated = await retryOutboxRow(input.outboxId);

      // Post-commit enqueue with the FRESH generation. A failure (Redis
      // down) still reports success: the row is pending and the outbox
      // drainer picks it up — Postgres is the durable boundary.
      try {
        await ctx.jobs.enqueueSyncShipment({
          outboxId: updated.id,
          generation: updated.claimGeneration,
        });
      } catch (error) {
        console.warn(
          "sync-shipment enqueue failed (drainer will recover):",
          error instanceof Error ? error.message : error
        );
      }

      return { id: updated.id, status: updated.status };
    }),

  /**
   * Cancel an unresolved outbox row: any non-terminal -> `canceled`
   */
  cancelOutboxRow: orgProcedure
    .input(z.object({ outboxId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = ctx.organizationId;
      const existing = await verifyOwnership(organizationId, input.outboxId);

      const terminalStatuses = ["confirmed", "canceled"];
      if (terminalStatuses.includes(existing.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel: row is already in terminal status "${existing.status}"`,
        });
      }

      const updated = await cancelOutboxRow(input.outboxId);
      return { id: updated.id, status: updated.status };
    }),
});
