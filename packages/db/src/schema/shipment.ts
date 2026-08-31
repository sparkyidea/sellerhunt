import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { order, orderLine } from "./order";
import { warehouse } from "./warehouse";

/**
 * Label-purchase lifecycle. Mirrors Shippo's `Transaction.status` enum
 * (https://docs.goshippo.com/docs/labels/transactions/) verbatim.
 *
 * Carrier-scan state lives on `track` — see `packages/db/src/schema/track.ts`.
 * The "did this physically ship?" timestamp is `shipment.shipped_at`.
 */
export const labelStatusEnum = pgEnum("label_status", [
  "waiting",
  "queued",
  "success",
  "error",
  "refunded",
  "refund_pending",
  "refund_rejected",
]);

export const packagePreset = pgTable(
  "package_preset",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }), // null = global preset, set = org-specific preset
    name: text("name").notNull(), // e.g. "Small Box", "Padded Mailer"
    length: numeric("length"), // inches
    width: numeric("width"), // inches
    height: numeric("height"), // inches
    weight: numeric("weight"), // ounces
    providerTemplate: text("provider_template"), // e.g. "USPS_SmallFlatRateBox"
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("package_preset_organization_id_idx").on(table.organizationId),
  ]
);

export const packagePresetRelations = relations(packagePreset, ({ many }) => ({
  shipments: many(shipment),
}));

export const shipment = pgTable(
  "shipment",
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
    orderId: text("order_id").references(() => order.id, {
      onDelete: "cascade",
    }),
    shipFromName: text("ship_from_name"),
    shipFromCompany: text("ship_from_company"),
    shipFromEmail: text("ship_from_email"),
    shipFromPhone: text("ship_from_phone"),
    shipFromAddress1: text("ship_from_address_1"),
    shipFromAddress2: text("ship_from_address_2"),
    shipFromCity: text("ship_from_city"),
    shipFromState: text("ship_from_state"),
    shipFromZipcode: text("ship_from_zipcode"),
    shipFromCountry: text("ship_from_country"),
    /** Geocoded from the full ship-from address. Null until geocoded. */
    shipFromLatitude: doublePrecision("ship_from_latitude"),
    shipFromLongitude: doublePrecision("ship_from_longitude"),
    shipToName: text("ship_to_name"),
    shipToCompany: text("ship_to_company"),
    shipToEmail: text("ship_to_email"),
    shipToPhone: text("ship_to_phone"),
    shipToAddress1: text("ship_to_address_1"),
    shipToAddress2: text("ship_to_address_2"),
    shipToCity: text("ship_to_city"),
    shipToState: text("ship_to_state"),
    shipToZipcode: text("ship_to_zipcode"),
    shipToCountry: text("ship_to_country"),
    /** Geocoded from the full ship-to address. Null until geocoded. */
    shipToLatitude: doublePrecision("ship_to_latitude"),
    shipToLongitude: doublePrecision("ship_to_longitude"),
    /**
     * Display / backwards-compat only. Rule: FUL-008 — the source of
     * truth for per-marketplace-order fulfillment IDs is the outbox row's
     * `external_ref`. A merged shipment has ONE reference but N remote
     * fulfillment IDs, so keying a void or re-push on this silently drops
     * every child but one.
     */
    reference: text("reference"),
    carrier: text("carrier"),
    method: text("method"),
    tracking: text("tracking"),
    warehouseId: text("warehouse_id").references(() => warehouse.id, {
      onDelete: "set null",
    }),
    shippingCost: integer("shipping_cost"), // cents
    packagePresetId: text("package_preset_id").references(
      () => packagePreset.id,
      { onDelete: "set null" }
    ),
    weight: numeric("weight"), // ounces
    packageName: text("package_name"), // e.g. "Custom Box", "Flat Rate Envelope"
    packageLength: numeric("package_length"), // inches
    packageWidth: numeric("package_width"), // inches
    packageHeight: numeric("package_height"), // inches
    provider: text("provider"), // Label provider: "shippo", "easypost", null = external
    providerShipmentId: text("provider_shipment_id"), // Provider's shipment object ID
    providerTransactionId: text("provider_transaction_id"), // Provider's label/transaction ID
    providerRateId: text("provider_rate_id"), // Which rate quote was selected
    labelStatus: labelStatusEnum("label_status"), // mirrors Shippo Transaction.status
    labelPurchasedAt: timestamp("label_purchased_at"), // When label was bought
    labelUrl: text("label_url"), // URL to shipping label PDF
    pickListUrl: text("pick_list_url"), // URL to pick list PDF
    manifestId: text("manifest_id"), // Manifest ID for batch shipping
    /**
     * When this specific shipment was handed off to the carrier. Sourced
     * from marketplace `fulfillment.shippedAt` on import, or set when our
     * own outbox push to a marketplace succeeds. Distinct from `order.shippedAt`
     * — that's the marketplace's order-level view; this is per-shipment.
     */
    shippedAt: timestamp("shipped_at"),
    /**
     * Provenance of this row. See {@link ShipmentSource}.
     *   "local"        — created by user via `shipmentRouter.create`
     *   "marketplace"  — materialized from a remote fulfillment observed
     *                    during pull-orders that has no matching local
     *                    push (out-of-band shipment, e.g. user shipped
     *                    directly in eBay Seller Hub).
     *
     * Rule: FUL-004 — this column is the audit for marketplace-sourced
     * rows; they carry no outbox row and no correlation method.
     */
    source: text("source").notNull().default("local"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("shipment_organization_id_idx").on(table.organizationId),
    uniqueIndex("shipment_order_reference_idx").on(
      table.orderId,
      table.reference
    ),
  ]
);

export type ShipmentSource = "local" | "marketplace";

export const shipmentLine = pgTable(
  "shipment_line",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipment.id, { onDelete: "cascade" }),
    orderLineId: text("order_line_id")
      .notNull()
      .references(() => orderLine.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(), // Quantity of this order line in this shipment
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Keyed upsert target for sync: one row per (shipment, orderLine);
    // quantity is updated in place. Also covers shipmentId lookups.
    uniqueIndex("shipment_line_shipment_order_line_unique").on(
      table.shipmentId,
      table.orderLineId
    ),
    index("shipment_line_order_line_id_idx").on(table.orderLineId),
    index("shipment_line_organization_id_idx").on(table.organizationId),
  ]
);
