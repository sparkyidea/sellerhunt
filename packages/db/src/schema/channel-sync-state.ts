import { type InferSelectModel, relations } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { channel } from "./channel";

/**
 * The sync domains a channel participates in — one per domain queue.
 * `channels` covers channel-info/token/subscription maintenance.
 *
 * Rule: SYN-007 — progress is keyed per channel AND domain. The old
 * `channel.{syncedAt,syncStatus,syncError}` triple could not express
 * "listings healthy, orders failing", which is the state that matters
 * most during an incident. Do not re-add sync columns to `channel`.
 */
export const syncDomainEnum = pgEnum("sync_domain", [
  "orders",
  "listings",
  "shipments",
  "tracking",
  "channels",
]);

/**
 * Per-(channel, domain) sync progress. Replaces the single
 * `channel.{syncedAt,syncStatus,syncError}` triple, which conflated all
 * domains into one watermark; that triple is kept through the rollback
 * window as an orders-domain projection.
 *
 * `syncedAt` is the incremental watermark — advanced only when a run
 * completes with zero failures, so a failed run re-reads the missed window.
 * `lastRunAt` records the last attempt regardless of outcome; dispatchers
 * use it to spot channels whose schedule silently stopped firing.
 */
export const channelSyncState = pgTable(
  "channel_sync_state",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => channel.id, { onDelete: "cascade" }),
    domain: syncDomainEnum("domain").notNull(),
    status: text("status"),
    error: text("error"),
    syncedAt: timestamp("synced_at"),
    lastRunAt: timestamp("last_run_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("channel_sync_state_channel_domain_unique").on(
      table.channelId,
      table.domain
    ),
    index("channel_sync_state_organization_id_idx").on(table.organizationId),
    // Dispatcher eligibility scans: per-domain, ordered by watermark age.
    index("channel_sync_state_domain_synced_at_idx").on(
      table.domain,
      table.syncedAt
    ),
  ]
);

export const channelSyncStateRelations = relations(
  channelSyncState,
  ({ one }) => ({
    channel: one(channel, {
      fields: [channelSyncState.channelId],
      references: [channel.id],
    }),
  })
);

export type SelectChannelSyncState = InferSelectModel<typeof channelSyncState>;
export type SyncDomain = (typeof syncDomainEnum.enumValues)[number];
