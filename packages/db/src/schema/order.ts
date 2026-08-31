import { relations, type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tsvector } from "../utils/custom-types";
import { organization, user } from "./auth";
import { channel } from "./channel";
import { issue } from "./issue";
import { listingVariant } from "./listing";
import { productVariant } from "./product";
import { shipment } from "./shipment";

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "unfulfilled",
  "partially_fulfilled",
  "fulfilled",
  "completed",
  "canceled",
  "returned",
  "refunded",
]);

export const order = pgTable(
  "order",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    channelId: text("channel_id").references(() => channel.id, {
      onDelete: "cascade",
    }),
    reference: text("reference"),
    orderNumber: text("order_number"),
    customerUsername: text("customer_username"),
    billingName: text("billing_name"),
    billingCompany: text("billing_company"),
    billingEmail: text("billing_email"),
    billingPhone: text("billing_phone"),
    billingAddress1: text("billing_address_1"),
    billingAddress2: text("billing_address_2"),
    billingCity: text("billing_city"),
    billingState: text("billing_state"),
    billingZipCode: text("billing_zip_code"),
    billingCountry: text("billing_country"),
    subtotal: integer("subtotal"), // cents
    shippingCost: integer("shipping_cost"), // cents
    discount: integer("discount"), // cents
    tax: integer("tax"), // cents
    total: integer("total"), // cents
    currency: text("currency").notNull().default("USD"),
    shippingName: text("shipping_name"),
    shippingCompany: text("shipping_company"),
    shippingEmail: text("shipping_email"),
    shippingPhone: text("shipping_phone"),
    shippingAddress1: text("shipping_address_1"),
    shippingAddress2: text("shipping_address_2"),
    shippingCity: text("shipping_city"),
    shippingState: text("shipping_state"),
    shippingZipCode: text("shipping_zip_code"),
    shippingCountry: text("shipping_country"),
    orderedAt: timestamp("ordered_at"),
    status: orderStatusEnum("status"),
    statusDate: timestamp("status_date"),
    fulfillmentStatus: text("fulfillment_status"),
    fulfillmentStrategy: text("fulfillment_strategy"), // 'auto', 'manual', 'split'
    multiWarehouse: boolean("multi_warehouse").notNull().default(false),
    autoFulfill: boolean("auto_fulfill").notNull().default(false),
    fulfillmentHoldReason: text("fulfillment_hold_reason"),
    refund: integer("refund"), // cents
    paymentMethod: text("payment_method"),
    paidAt: timestamp("paid_at"),
    shipBy: timestamp("ship_by"),
    shippedAt: timestamp("shipped_at"),
    requestedShippingCarrier: text("requested_shipping_carrier"),
    requestedShippingMethod: text("requested_shipping_method"),
    customerNote: text("customer_note"),
    sellerNote: text("seller_note"),
    deliverBy: timestamp("deliver_by"),
    deliveredAt: timestamp("delivered_at"),
    /**
     * Provider modification clock (Shopify `updatedAt`, eBay
     * `lastModifiedDate`) of the snapshot this row was last written from.
     * Every sync write guards `WHERE source_version_at IS NULL OR
     * source_version_at <= :incoming`; 0 rows updated on an existing row
     * means the incoming snapshot is stale and ALL child writes for the
     * order must be aborted. Never compared against local clocks.
     */
    sourceVersionAt: timestamp("source_version_at"),
    /**
     * Stamped when a single-order pull came back not-found — the
     * marketplace no longer resolves this order. Late-link repair skips
     * marked orders (otherwise a permanently-gone order re-enqueues after
     * every listings run and can starve the relink batch). Cleared by any
     * later successful sync upsert, which proves the order exists again.
     */
    remoteMissingAt: timestamp("remote_missing_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),

    archived: boolean("archived").notNull().default(false),

    /**
     * If this order was merged with others for shipping, points at the
     * synthetic parent order created by `shipmentRouter.create` when the
     * user selected multiple orders to ship together. Null for unmerged
     * orders (the common case) and for the parent orders themselves
     * (parents have no further parent).
     *
     * Parent orders are dashseller-only: `reference` is NULL on them,
     * and they exist only to give the merged shipment a stable
     * `shipment.orderId` target.
     *
     * Rule: FUL-001 — this self-FK is what keeps `1 tracking = 1 shipment
     * = 1 order` true for merges, instead of a shipment↔order join table.
     * FUL-002 — correlation compares `parentOrderId ?? id`, never the raw
     * id. FUL-007 — merges are user-initiated; pulls never infer one.
     */
    parentOrderId: text("parent_order_id").references(
      (): AnyPgColumn => order.id,
      { onDelete: "set null" }
    ),

    // Full-text search (generated column — auto-computed by PostgreSQL)
    search: tsvector("search").generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('simple', coalesce(${order.orderNumber}, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(${order.reference}, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(${order.customerUsername}, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(${order.billingEmail}, '')), 'B')
      `
    ),
  },
  (table) => [
    uniqueIndex("order_organization_id_channel_id_reference_unique").on(
      table.organizationId,
      table.channelId,
      table.reference
    ),
    index("order_organization_id_idx").on(table.organizationId),
    index("order_number_idx").on(table.orderNumber),
    index("order_channel_id_idx").on(table.channelId),
    index("order_ordered_at_idx").on(table.orderedAt),
    index("order_status_idx").on(table.status),
    index("order_archived_idx").on(table.archived),
    index("order_parent_order_id_idx").on(table.parentOrderId),
    index("order_search_idx").using("gin", table.search),
  ]
);

export const orderRelations = relations(order, ({ many, one }) => ({
  orderLines: many(orderLine),
  orderEvents: many(orderEvent),
  issues: many(issue),
  shipments: many(shipment),
  channel: one(channel, {
    fields: [order.channelId],
    references: [channel.id],
  }),
}));

export const orderLineStatusEnum = pgEnum("order_line_status", [
  "pending",
  "unfulfilled",
  "partially_fulfilled",
  "fulfilled",
  "completed",
  "canceled",
  "returned",
  "refunded",
]);

export const orderLine = pgTable(
  "order_line",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    orderId: text("order_id").references(() => order.id, {
      onDelete: "cascade",
    }),
    // Rule: ORD-001 — both identities, deliberately. The listing variant
    // is what the channel charged for and what a fulfillment references;
    // the product variant is what has weight, dimensions, and stock.
    // Neither is derivable from the other at read time.
    listingVariantId: text("listing_variant_id").references(
      () => listingVariant.id,
      { onDelete: "set null" }
    ),
    productVariantId: text("product_variant_id").references(
      () => productVariant.id,
      { onDelete: "set null" }
    ),
    /**
     * Marketplace listing-variant reference captured at pull time, even
     * when it doesn't resolve to a local listing_variant yet (orders pulled
     * before listings). Drives late-link repair: after a listings run,
     * lines with a stored reference but NULL listing_variant_id are
     * re-synced via sync-order.
     */
    listingVariantReference: text("listing_variant_reference"),
    reference: text("reference"), // Marketplace line item ID
    title: text("title"),
    imageUrl: text("image_url"),
    quantity: integer("quantity"),
    sku: text("sku"),
    unitPrice: integer("unit_price"), // cents
    discount: integer("discount"), // cents
    tax: integer("tax"), // cents
    total: integer("total"), // cents
    quantityFulfilled: integer("quantity_fulfilled"),
    status: orderLineStatusEnum("status"),
    warehouseId: text("warehouse_id"), // Which warehouse should fulfill this line
    cancelReason: text("cancel_reason"),
    fulfillmentPriority: integer("fulfillment_priority").notNull().default(100), // Higher priority fulfilled first
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("order_line_order_id_reference_unique").on(
      table.orderId,
      table.reference
    ),
    index("order_line_organization_id_idx").on(table.organizationId),
    index("order_line_listing_variant_id_idx").on(table.listingVariantId),
    index("order_line_unresolved_reference_idx")
      .on(table.listingVariantReference)
      .where(
        sql`${table.listingVariantId} IS NULL AND ${table.listingVariantReference} IS NOT NULL`
      ),
  ]
);

export const orderLineRelations = relations(orderLine, ({ one }) => ({
  order: one(order, {
    fields: [orderLine.orderId],
    references: [order.id],
  }),
  listingVariant: one(listingVariant, {
    fields: [orderLine.listingVariantId],
    references: [listingVariant.id],
  }),
  productVariant: one(productVariant, {
    fields: [orderLine.productVariantId],
    references: [productVariant.id],
  }),
}));

export const orderEventTypeEnum = pgEnum("order_event_type", [
  "comment", // User-posted comment on the order
  "tracking", // Carrier tracking update (e.g. "Departed facility")
  "system", // System-generated event (e.g. status change, fulfillment update)
]);

export const orderEvent = pgTable(
  "order_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    shipmentId: text("shipment_id"), // Optional link to shipment for tracking events
    type: orderEventTypeEnum("type").notNull(),
    title: text("title").notNull(), // e.g. "Departed USPS Regional Facility"
    description: text("description"), // Optional longer detail
    occurredAt: timestamp("occurred_at").notNull(), // When the event actually happened
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("order_event_order_id_idx").on(table.orderId),
    index("order_event_organization_id_idx").on(table.organizationId),
    index("order_event_occurred_at_idx").on(table.occurredAt),
  ]
);

export const orderEventRelations = relations(orderEvent, ({ one }) => ({
  order: one(order, {
    fields: [orderEvent.orderId],
    references: [order.id],
  }),
}));
