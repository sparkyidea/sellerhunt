import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { channel } from "./channel";
import { order, orderLine } from "./order";

export const issueTypeEnum = pgEnum("issue_type", [
  "cancellation",
  "return",
  "refund",
  "replacement",
  "warranty",
  "claim",
]);

export const issueStatusEnum = pgEnum("issue_status", [
  "open",
  "under_review",
  "approved",
  "rejected",
  "resolved",
  "escalated",
]);

export const issueResolutionEnum = pgEnum("issue_resolution", [
  "refunded",
  "replaced",
  "repaired",
  "denied",
  "credited",
  "cancelled",
]);

export const issue = pgTable(
  "issue",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    channelId: text("channel_id").references(() => channel.id, {
      onDelete: "cascade",
    }),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    orderLineId: text("order_line_id").references(() => orderLine.id, {
      onDelete: "set null",
    }),
    reference: text("reference"), // Marketplace issue/dispute ID
    type: issueTypeEnum("type").notNull(),
    status: issueStatusEnum("status").notNull().default("open"),
    resolution: issueResolutionEnum("resolution"),
    /** Verbatim reason from the marketplace (free-form, e.g. eBay's `DEFECTIVE_ITEM`). */
    reason: text("reason"),
    /**
     * Normalized reason code. Free-form text; values depend on `type`.
     * Conventions per type live in
     * `packages/marketplace/docs/status-mapping.md`. Examples:
     * - type=`return`: `defective`, `arrived_damaged`, `wrong_item`, etc.
     * - type=`cancellation`: `out_of_stock`, `customer_request`, `fraud`, etc.
     */
    reasonCode: text("reason_code"),
    customerNote: text("customer_note"),
    sellerNote: text("seller_note"),
    refundAmount: integer("refund_amount"), // cents
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("issue_order_id_type_unique").on(table.orderId, table.type),
    index("issue_organization_id_idx").on(table.organizationId),
    index("issue_channel_id_idx").on(table.channelId),
    index("issue_order_id_idx").on(table.orderId),
    index("issue_type_idx").on(table.type),
    index("issue_status_idx").on(table.status),
    index("issue_reference_idx").on(table.reference),
  ]
);

export const issueRelations = relations(issue, ({ one }) => ({
  order: one(order, {
    fields: [issue.orderId],
    references: [order.id],
  }),
}));
