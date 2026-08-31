import type { InferSelectModel } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { marketplace } from "./marketplace";
import { country } from "./world";

export const channel = pgTable(
  "channel",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    marketplaceId: text("marketplace_id")
      .notNull()
      .references(() => marketplace.id, { onDelete: "cascade" }),
    countryId: text("country_id").references(() => country.id, {
      onDelete: "restrict",
    }),
    // Immutable marketplace store identifier (e.g. eBay user id, Shopify
    // shop). Part of the global unique index below, so it MUST be non-null —
    // a null would make the index treat rows as distinct and let the same
    // store be linked to multiple organizations.
    reference: text("reference").notNull(),
    displayName: text("display_name").notNull(),
    connected: boolean("connected"),
    /**
     * Last time this channel transitioned to connected, stamped by the OAuth
     * upsert. Lets a notification worker discard an event that predates a
     * reconnect — a delayed or drained `app/uninstalled` would otherwise
     * disconnect a channel the seller has since reconnected, and delete the
     * subscription rows that reconnect just wrote.
     */
    connectedAt: timestamp("connected_at"),
    /**
     * Fencing token for the connection lifecycle. Rotated (fresh uuid) in the
     * same transaction that persists tokens on every OAuth connect/reconnect.
     * Inbound webhook deliveries capture the generation they were resolved
     * under; a disconnect whose payload generation no longer matches the row
     * is stale and must no-op instead of tearing down a connection the seller
     * has since re-established.
     */
    connectionGeneration: uuid("connection_generation")
      .notNull()
      .defaultRandom(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    archived: boolean("archived").notNull().default(false),
  },
  (table) => [
    // Rule: TEN-002 — every read filters on organizationId, so composite
    // indexes on business tables lead with it.
    index("channel_organization_id_idx").on(table.organizationId),
    index("channel_marketplace_id_idx").on(table.marketplaceId),
    index("channel_archived_idx").on(table.archived),
    uniqueIndex("channel_marketplace_reference_unique").on(
      table.marketplaceId,
      table.reference
    ),
  ]
);

export const channelToken = pgTable("channel_token", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  channelId: text("channel_id")
    .references(() => channel.id, {
      onDelete: "cascade",
    })
    .unique()
    .notNull(),
  // IMPORTANT: These tokens MUST be encrypted before storing in the database
  // Use encryptSecret() from @dashseller/utils before insert/update
  // Use decryptSecret() when reading from database
  accessToken: text("access_token").notNull(), // Channel encrypted
  // SENTINEL: For marketplaces that don't issue refresh tokens (Shopify
  // offline access), this column stores the encrypted literal "none" — see
  // SENTINEL_NO_REFRESH_TOKEN in `@dashseller/marketplace/utils`. Maintenance
  // scripts that decrypt and validate tokens must tolerate the sentinel.
  refreshToken: text("refresh_token").notNull(), // Channel encrypted
  // SENTINEL: For marketplaces whose access tokens never expire (Shopify
  // offline access), this column stores the far-future date 9999-12-31 —
  // see SENTINEL_NEVER_EXPIRES_AT. The `isTokenExpired` check naturally
  // short-circuits on the sentinel so no special-case branching is needed.
  accessTokenExpiresAt: timestamp("access_token_expires_at").notNull(),
  // SENTINEL: Same sentinel as accessTokenExpiresAt for marketplaces that
  // don't rotate refresh tokens.
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const channelRelations = relations(channel, ({ one }) => ({
  marketplace: one(marketplace, {
    fields: [channel.marketplaceId],
    references: [marketplace.id],
  }),
}));

export type SelectChannel = InferSelectModel<typeof channel>;
export type SelectChannelToken = InferSelectModel<typeof channelToken>;
