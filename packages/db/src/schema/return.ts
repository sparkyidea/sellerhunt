import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { channel } from "./channel";
import { issue } from "./issue";
import { order, orderLine } from "./order";
import { shipment } from "./shipment";
import { warehouse } from "./warehouse";

/**
 * Item-level condition assessment after a return shipment has been received
 * and inspected. This is a per-line attribute — different items in the same
 * return can have different outcomes.
 */
export const inspectionOutcomeEnum = pgEnum("inspection_outcome", [
  "new", // Pristine, unopened — fully restockable
  "open_box", // Opened but unused — restockable as open-box
  "used", // Used — restockable only at reduced grade
  "damaged", // Physical damage — likely not restockable
  "defective", // Non-functional — likely not restockable
  "missing_items", // Return is incomplete (some items absent)
  "wrong_item_returned", // Buyer sent something different
]);

/**
 * The `return` table holds RMA + warehouse-inspection metadata for a return.
 * Workflow state (requested / approved / rejected / resolved) lives on the
 * linked `issue`. Physical movement (in transit / delivered) lives on the
 * linked `shipment`. This table is the operational record connecting both.
 */
export const returnTable = pgTable(
  "return",
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
    channelId: text("channel_id")
      .notNull()
      .references(() => channel.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    /** Linked customer-facing workflow (cancellation/return/refund/etc). */
    issueId: text("issue_id").references(() => issue.id, {
      onDelete: "set null",
    }),
    /** The reverse-direction shipment carrying the items back. */
    shipmentId: text("shipment_id").references(() => shipment.id, {
      onDelete: "set null",
    }),
    warehouseId: text("warehouse_id").references(() => warehouse.id, {
      onDelete: "set null",
    }),
    reference: text("reference"), // RMA number from the marketplace
    sellerNote: text("seller_note"),
    refundAmount: integer("refund_amount"), // cents
    restockingFee: integer("restocking_fee"), // cents
    shippingRefund: integer("shipping_refund"), // cents
    totalRefund: integer("total_refund"), // cents
    refunded: boolean("refunded").notNull().default(false),
    refundedAt: timestamp("refunded_at"),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    receivedAt: timestamp("received_at"),
    inspectedAt: timestamp("inspected_at"),
    inspectedByUserId: text("inspected_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("return_organization_id_idx").on(table.organizationId),
    index("return_channel_id_idx").on(table.channelId),
    index("return_order_id_idx").on(table.orderId),
    index("return_issue_id_idx").on(table.issueId),
    index("return_shipment_id_idx").on(table.shipmentId),
    index("return_reference_idx").on(table.reference),
  ]
);

export const returnRelations = relations(returnTable, ({ many, one }) => ({
  returnLines: many(returnLine),
  issue: one(issue, {
    fields: [returnTable.issueId],
    references: [issue.id],
  }),
  shipment: one(shipment, {
    fields: [returnTable.shipmentId],
    references: [shipment.id],
  }),
}));

export const returnLine = pgTable(
  "return_line",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    returnId: text("return_id")
      .notNull()
      .references(() => returnTable.id, { onDelete: "cascade" }),
    orderLineId: text("order_line_id").references(() => orderLine.id, {
      onDelete: "set null",
    }),
    quantity: integer("quantity").notNull(),
    quantityReceived: integer("quantity_received").notNull().default(0),
    unitRefund: integer("unit_refund"), // cents
    /** Item condition assessment recorded during inspection. */
    inspectionOutcome: inspectionOutcomeEnum("inspection_outcome"),
    /** Free-form inspector notes alongside the structured outcome. */
    note: text("note"),
    restockable: boolean("restockable").notNull().default(true),
    restockedAt: timestamp("restocked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("return_line_return_id_idx").on(table.returnId),
    index("return_line_order_line_id_idx").on(table.orderLineId),
    index("return_line_organization_id_idx").on(table.organizationId),
  ]
);

export const returnLineRelations = relations(returnLine, ({ one }) => ({
  return: one(returnTable, {
    fields: [returnLine.returnId],
    references: [returnTable.id],
  }),
}));
