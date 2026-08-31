import { relations } from "drizzle-orm";
import {
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { shipment } from "./shipment";

/**
 * Top-level tracking lifecycle. Mirrors Shippo's `Track.tracking_status.status`
 * vocabulary (https://docs.goshippo.com/docs/tracking/tracking).
 */
export const trackingStatusEnum = pgEnum("tracking_status", [
  "pre_transit",
  "transit",
  "delivered",
  "returned",
  "failure",
  "unknown",
]);

/**
 * Sub-categorization of `tracking_status`. Mirrors Shippo's substatus list.
 * Each substatus belongs to exactly one parent status; we don't enforce that
 * relationship at the type level, only by convention.
 */
export const trackingSubstatusEnum = pgEnum("tracking_substatus", [
  // PRE_TRANSIT
  "information_received",
  // TRANSIT
  "address_issue",
  "contact_carrier",
  "delayed",
  "delivery_attempted",
  "delivery_rescheduled",
  "delivery_scheduled",
  "location_inaccessible",
  "notice_left",
  "out_for_delivery",
  "package_accepted",
  "package_arrived",
  "package_damaged",
  "package_departed",
  "package_forwarded",
  "package_held",
  "package_processed",
  "package_processing",
  "pickup_available",
  "reschedule_delivery",
  // DELIVERED
  "delivered",
  // RETURNED
  "return_to_sender",
  "package_unclaimed",
  // FAILURE
  "package_undeliverable",
  "package_disposed",
  "package_lost",
  // UNKNOWN
  "other",
]);

/**
 * One row per (user, tracking_number). Mirrors Shippo's `Track` object
 * — only the coarse top-level `status` is denormalized here; the full
 * scan history lives in `tracking_event`.
 */
export const tracking = pgTable(
  "tracking",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Tracking rows are children of shipments — every tracking exists
    // because some shipment owns its tracking number. Cascade on delete
    // (no orphan tracking rows) and require non-null at insert.
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipment.id, {
        onDelete: "cascade",
      }),

    // Which adapter services this tracking — the *tracking source*, not
    // the shipping carrier. Today only `"package-tracker"`. Future direct
    // integrations (UPS/USPS/DHL/FedEx/Shippo) would each get their own
    // provider slug. The shipping carrier lives on `shipment.carrier`.
    provider: text("provider").notNull(),
    trackingNumber: text("tracking_number").notNull(),
    serviceLevelToken: text("service_level_token"),
    serviceLevelName: text("service_level_name"),
    metadata: text("metadata"),

    // ETAs
    originalEta: timestamp("original_eta"),
    eta: timestamp("eta"),

    // Coarse top-level status — kept denormalized for two reasons: the
    // poll cron filters by `notInArray(status, TERMINAL_STATUSES)` every
    // 30 min (indexed via `tracking_status_idx`), and the shipment
    // dataview filters by `trackings.status` for presets like "exclude
    // delivered". Finer detail (substatus, location, status_details,
    // status_date) lives on `tracking_event` and is read off the latest
    // event when displayed.
    status: trackingStatusEnum("status").notNull().default("unknown"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("tracking_organization_number_idx").on(
      t.organizationId,
      t.trackingNumber
    ),
    index("tracking_shipment_id_idx").on(t.shipmentId),
    index("tracking_status_idx").on(t.status),
  ]
);

/**
 * One row per carrier scan. Mirrors Shippo's `tracking_history[]` entries.
 * Append-only; re-polling the same tracking number conflicts on
 * `(tracking_id, reference)` and is silently ignored.
 */
export const trackingEvent = pgTable(
  "tracking_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    trackingId: text("tracking_id")
      .notNull()
      .references(() => tracking.id, { onDelete: "cascade" }),

    /**
     * Stable per-event identifier from the tracking source — Shippo's
     * `object_id` directly, or a deterministic hash for sources that don't
     * issue one.
     */
    reference: text("reference").notNull(),

    status: trackingStatusEnum("status").notNull(),
    substatus: trackingSubstatusEnum("substatus"),
    statusDetails: text("status_details"),
    statusDate: timestamp("status_date").notNull(),

    locationCity: text("location_city"),
    locationState: text("location_state"),
    locationZip: text("location_zip"),
    locationCountry: text("location_country"),

    /**
     * Raw upstream location string ("ESCONDIDO, CA 92026",
     * "NEW YORK NY DISTRIBUTION CENTER"). Null when the upstream
     * didn't send one (synthesized transit events). Source of truth
     * for re-parsing and the Google fallback query — the structured
     * `location_*` columns are a lossy projection.
     */
    location: text("location"),

    /**
     * Resolved coordinates from the write-time lookup chain
     * (zip → city+state → state centroid against the seeded world
     * tables). Null when every tier missed (no state code, or state
     * code outside the seeded set).
     */
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("tracking_event_tracking_reference_idx").on(
      t.trackingId,
      t.reference
    ),
    index("tracking_event_status_date_idx").on(t.statusDate),
  ]
);

export const trackingRelations = relations(tracking, ({ one, many }) => ({
  shipment: one(shipment, {
    fields: [tracking.shipmentId],
    references: [shipment.id],
  }),
  events: many(trackingEvent),
}));

export const trackingEventRelations = relations(trackingEvent, ({ one }) => ({
  tracking: one(tracking, {
    fields: [trackingEvent.trackingId],
    references: [tracking.id],
  }),
}));
