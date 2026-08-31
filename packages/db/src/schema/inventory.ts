import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { orderLine } from "./order";
import { productVariant } from "./product";
import { warehouse } from "./warehouse";

export const transactionTypeEnum = pgEnum("transaction_type", [
  "receive", // Stock received from supplier
  "reserve", // Reserved for order (Awaiting Payment)
  "fulfill", // Shipped (reduce quantity + reservedQuantity)
  "release", // Order canceled (reduce reservedQuantity only)
  "adjust", // Manual adjustment
  "return", // Customer return
]);

export const stock = pgTable(
  "stock",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouse.id, {
        onDelete: "cascade",
      }),
    productVariantId: text("product_variant_id")
      .notNull()
      .references(() => productVariant.id, {
        onDelete: "cascade",
      }),
    quantity: integer("quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0), // Quantity allocated to orders
    /**
     * Provenance of the opening balance. `'listing_available'` means the
     * quantity was seeded from the marketplace's AVAILABLE count — already
     * net of every past sale — so the inventory pass applies the baseline
     * rule to orders placed before `seed_observed_at` instead of
     * decrementing again. NULL = manually created stock; the baseline rule
     * never fires.
     *
     * Rule: INV-002, INV-007.
     */
    seedBasis: text("seed_basis"),
    /**
     * LOWER bound on the seed observation: the listing's provider
     * observation clock when the adapter supplies one (eBay GetItem
     * response Timestamp), else an app clock captured immediately BEFORE
     * the listings page fetch. Orders strictly before it are definitely
     * inside the seed. Compared against provider clocks SQL-side only
     * (both UTC-naive) — a JS Date round-trip shifts by the host UTC
     * offset. Deliberately NOT the SQL `now()` used by `last_observed_at`.
     *
     * Rule: INV-003, INV-004.
     */
    seedObservedAt: timestamp("seed_observed_at"),
    /**
     * UPPER bound on the seed observation: equal to `seed_observed_at`
     * when it came from a provider clock, else an app clock captured
     * AFTER the page fetch. Restores strictly after it are definitely
     * missing from the seed. Each comparison uses the bound that errs
     * toward undersell — orders inside [lower, upper] classify post-seed,
     * restores inside it classify pre-seed.
     *
     * Rule: INV-001, INV-003.
     */
    seedObservedUpperAt: timestamp("seed_observed_upper_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("stock_organization_id_idx").on(table.organizationId),
    index("stock_warehouse_id_idx").on(table.warehouseId),
    // Rule: INV-006 — one stock row per (variant, warehouse). The only
    // place this can actually be guaranteed.
    uniqueIndex("stock_product_variant_warehouse_unique").on(
      table.productVariantId,
      table.warehouseId
    ),
  ]
);

export const stockRelations = relations(stock, ({ one, many }) => ({
  productVariant: one(productVariant, {
    fields: [stock.productVariantId],
    references: [productVariant.id],
  }),
  warehouse: one(warehouse, {
    fields: [stock.warehouseId],
    references: [warehouse.id],
  }),
  stockTransactions: many(stockTransaction),
}));

export const stockTransaction = pgTable(
  "stock_transaction",
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
    stockId: text("stock_id")
      .notNull()
      .references(() => stock.id, { onDelete: "cascade" }),
    orderLineId: text("order_line_id").references(() => orderLine.id, {
      onDelete: "set null",
    }),
    type: transactionTypeEnum("type").notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note"), // Optional reason for adjustment
    /**
     * Provider transition id this ledger row was derived from (e.g. a
     * fulfillment id), when the marketplace exposes one. Ties a counter
     * delta back to the remote event for diagnosis; null for local moves.
     */
    effectRef: text("effect_ref"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("stock_transaction_organization_id_idx").on(table.organizationId),
    index("stock_transaction_stock_id_idx").on(table.stockId),
    index("stock_transaction_order_line_id_idx").on(table.orderLineId),
    index("stock_transaction_type_idx").on(table.type),
    index("stock_transaction_created_at_idx").on(table.createdAt),
  ]
);

export const stockTransactionRelations = relations(
  stockTransaction,
  ({ one }) => ({
    stock: one(stock, {
      fields: [stockTransaction.stockId],
      references: [stock.id],
    }),
  })
);

/**
 * Per-line inventory state: pins an order line to the single stock row all
 * its effects apply to, plus cumulative, monotonically non-decreasing
 * applied counters. Marketplace snapshots are reduced to deltas against
 * these counters, so re-processing the same snapshot — or two concurrent
 * identical jobs — nets to zero instead of double-applying.
 *
 * The row is created (`INSERT … ON CONFLICT DO NOTHING` then
 * `SELECT … FOR UPDATE`) and locked before any effect is derived, so
 * concurrent jobs for the same line serialize here — a narrow lock instead
 * of a queue-wide one — and a line can never split its counters across two
 * stock rows.
 *
 * Invariants (`fulfilled + released ≤ reserved`) are enforced by clamping
 * in the sync transaction and recording a conflict, not by rejecting
 * writes. `applied_restocked_quantity` has no writer yet (return flow is
 * future work).
 *
 * Rule: INV-008 — the single row describing a line's inventory effect.
 * `stock_effect` / `order_line_stock_assignment` are gone; do not
 * reintroduce a parallel state table.
 */
export const orderLineInventoryState = pgTable(
  "order_line_inventory_state",
  {
    orderLineId: text("order_line_id")
      .primaryKey()
      .references(() => orderLine.id, { onDelete: "cascade" }),
    stockId: text("stock_id")
      .notNull()
      .references(() => stock.id, { onDelete: "restrict" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    appliedReservedQuantity: integer("applied_reserved_quantity")
      .notNull()
      .default(0),
    appliedFulfilledQuantity: integer("applied_fulfilled_quantity")
      .notNull()
      .default(0),
    appliedReleasedQuantity: integer("applied_released_quantity")
      .notNull()
      .default(0),
    appliedRestockedQuantity: integer("applied_restocked_quantity")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("order_line_inventory_state_stock_id_idx").on(table.stockId),
    index("order_line_inventory_state_organization_id_idx").on(
      table.organizationId
    ),
    check(
      "order_line_inventory_state_reserved_non_negative",
      sql`${table.appliedReservedQuantity} >= 0`
    ),
    check(
      "order_line_inventory_state_fulfilled_non_negative",
      sql`${table.appliedFulfilledQuantity} >= 0`
    ),
    check(
      "order_line_inventory_state_released_non_negative",
      sql`${table.appliedReleasedQuantity} >= 0`
    ),
    check(
      "order_line_inventory_state_restocked_non_negative",
      sql`${table.appliedRestockedQuantity} >= 0`
    ),
  ]
);

export const orderLineInventoryStateRelations = relations(
  orderLineInventoryState,
  ({ one }) => ({
    orderLine: one(orderLine, {
      fields: [orderLineInventoryState.orderLineId],
      references: [orderLine.id],
    }),
    stock: one(stock, {
      fields: [orderLineInventoryState.stockId],
      references: [stock.id],
    }),
  })
);
