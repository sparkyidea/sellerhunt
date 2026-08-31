import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const syncOutbox = pgTable(
  "sync_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    entityType: text("entity_type").notNull(), // 'order' | 'listing' | 'listingVariant'
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(), // 'createShipment' | 'updateListing' | 'updatePrice'
    payload: jsonb("payload").notNull(),
    sourceId: uuid("source_id"),
    /**
     * `pending → claimed → reconciling → sending → awaiting_confirmation →
     * confirmed`, plus `failed`, `conflict`, `canceled`, and
     * `reconciliation_required` (a send timed out mid-flight; a recovery job
     * must establish remotely whether it landed before the row can move).
     */
    status: text("status").notNull().default("pending"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    /**
     * Stable BullMQ job id of the current claimant — NOT the per-attempt
     * lock token, so retries of the same job can resume their own claim.
     * Cleared when the row returns to a dispatchable state.
     */
    claimedByJob: text("claimed_by_job"),
    /**
     * Fencing token. Incremented on every transition back to a dispatchable
     * state (stale reset, manual retry, recovery re-dispatch). Every outbox
     * mutation predicates on `claim_generation = :payloadGeneration`, so a
     * stale retained job holding an older generation can never claim or
     * mutate a re-dispatched row.
     */
    claimGeneration: integer("claim_generation").notNull().default(0),
    externalRef: text("external_ref"),
    /**
     * How this push was correlated to its remote fulfillment.
     * Null until correlated. See {@link CorrelationMethod}.
     *
     * Lives on the outbox row (not on `shipment`) so per-push fidelity
     * is preserved: a merged shipment fans out to N outbox rows, each
     * of which can correlate via a different method.
     *
     * Rule: FUL-004 — provenance and correlation are separate axes.
     */
    correlationMethod: text("correlation_method"),
    remoteSnapshot: jsonb("remote_snapshot"),
    reconciledAt: timestamp("reconciled_at"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    pushedAt: timestamp("pushed_at"),
    confirmedAt: timestamp("confirmed_at"),
  },
  (table) => [
    index("sync_outbox_organization_id_idx").on(table.organizationId),
    // One unresolved mutation per (entityType, entityId)
    uniqueIndex("sync_outbox_entity_blocker_idx")
      .on(table.entityType, table.entityId)
      .where(sql`${table.status} NOT IN ('confirmed', 'canceled')`),
    // Fast in-flight lookup
    index("sync_outbox_in_flight_idx")
      .on(table.entityType, table.entityId, table.status)
      .where(
        sql`${table.status} IN ('pending', 'claimed', 'reconciling', 'sending', 'awaiting_confirmation', 'reconciliation_required')`
      ),
    // Control-plane scans: drainer (pending), sending-sweep (sending past
    // timeout), recovery dispatch (reconciliation_required), stale reset.
    index("sync_outbox_status_updated_at_idx").on(
      table.status,
      table.updatedAt
    ),
  ]
);

export type SyncOutbox = typeof syncOutbox.$inferSelect;
export type NewSyncOutbox = typeof syncOutbox.$inferInsert;

/**
 * How a `sync_outbox` row was correlated to its remote counterpart.
 *
 *   "remote_id"        — push response returned a fulfillment ID directly.
 *                        Strongest correlation; no inference.
 *   "client_reference" — adapter sent `outbox.id` and the marketplace
 *                        echoed it back on the listing endpoint.
 *   "tracking_match"   — both sides have tracking, normalized equal,
 *                        within the same (channel, order) scope.
 *   "manual_link"      — user explicitly linked via UI / operator tool.
 *
 * Null is allowed and common before confirmation; rare after.
 *
 * OOB shipments observed by pull-orders do not appear in this enum —
 * they live on `shipment.source = 'marketplace'` instead. One axis per
 * column.
 *
 * Rule: FUL-005 — try the rungs in this order and record which one won.
 * FUL-006 — never reintroduce a content hash as identity.
 */
export type CorrelationMethod =
  | "remote_id"
  | "client_reference"
  | "tracking_match"
  | "manual_link";
