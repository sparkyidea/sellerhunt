import {
  order,
  orderLine,
  shipment,
  shipmentLine,
  tracking,
  trackingEvent,
  warehouse,
} from "@dashseller/db/schema";
import type { ShippingFulfillment } from "@dashseller/marketplace/types";
import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import type { SyncContext } from "../context";

interface OrderShippingAddress {
  shippingAddress1: string | null;
  shippingAddress2: string | null;
  shippingCity: string | null;
  shippingCompany: string | null;
  shippingCountry: string | null;
  shippingEmail: string | null;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingState: string | null;
  shippingZipCode: string | null;
}

/**
 * Subset of `warehouse` columns auto-applied to newly-inserted shipment
 * rows. Resolved once per run when the organization has exactly one
 * non-archived warehouse — ambiguous (zero or 2+) cases leave ship-from
 * blank, and the user can edit the shipment later.
 */
export interface DefaultWarehouse {
  address1: string;
  address2: string | null;
  city: string;
  country: string | null;
  id: string;
  latitude: number | null;
  longitude: number | null;
  state: string;
  zipcode: string;
}

export async function resolveDefaultWarehouse(
  ctx: SyncContext,
  organizationId: string
): Promise<DefaultWarehouse | null> {
  const rows = await ctx.db
    .select({
      id: warehouse.id,
      address1: warehouse.address1,
      address2: warehouse.address2,
      city: warehouse.city,
      state: warehouse.state,
      zipcode: warehouse.zipcode,
      country: warehouse.country,
      latitude: warehouse.latitude,
      longitude: warehouse.longitude,
    })
    .from(warehouse)
    .where(
      and(
        eq(warehouse.organizationId, organizationId),
        eq(warehouse.archived, false)
      )
    )
    .limit(2);
  if (rows.length !== 1) {
    return null;
  }
  return rows[0] ?? null;
}

export interface UpsertOrderShipmentsInput {
  defaultWarehouse: DefaultWarehouse | null;
  fulfillments: ShippingFulfillment[];
  orderId: string;
  organizationId: string;
}

/**
 * Upsert local shipment + shipmentLine records from an order's marketplace
 * fulfillments. The fulfillment list is fetched once by the caller and
 * shared with the inventory derivation.
 */
export async function upsertOrderShipments(
  ctx: SyncContext,
  input: UpsertOrderShipmentsInput
): Promise<number> {
  if (input.fulfillments.length === 0) {
    return 0;
  }

  const lines = await ctx.db
    .select({
      id: orderLine.id,
      reference: orderLine.reference,
      quantity: orderLine.quantity,
    })
    .from(orderLine)
    .where(eq(orderLine.orderId, input.orderId));

  const lineRefToId = new Map(
    lines
      .filter(
        (l): l is typeof l & { reference: string } => l.reference !== null
      )
      .map((l) => [l.reference, { id: l.id, quantity: l.quantity ?? 1 }])
  );

  // Shipping address seeds shipTo* on newly-created shipment rows. Address
  // can be edited per-shipment later, so it's written on INSERT only.
  const [orderShipping] = await ctx.db
    .select({
      shippingName: order.shippingName,
      shippingCompany: order.shippingCompany,
      shippingEmail: order.shippingEmail,
      shippingPhone: order.shippingPhone,
      shippingAddress1: order.shippingAddress1,
      shippingAddress2: order.shippingAddress2,
      shippingCity: order.shippingCity,
      shippingState: order.shippingState,
      shippingZipCode: order.shippingZipCode,
      shippingCountry: order.shippingCountry,
    })
    .from(order)
    .where(eq(order.id, input.orderId));

  let upserted = 0;
  for (const fulfillment of input.fulfillments) {
    const didUpsert = await upsertSingleShipment(ctx, {
      organizationId: input.organizationId,
      orderId: input.orderId,
      fulfillment,
      lineRefToId,
      orderShipping: orderShipping ?? null,
      defaultWarehouse: input.defaultWarehouse,
    });
    if (didUpsert) {
      upserted++;
    }
  }
  return upserted;
}

/**
 * Upsert a single shipment from a marketplace fulfillment.
 * Uses reference (marketplace fulfillment ID) as the dedup key.
 * Updates carrier, tracking, method, and shippedAt on conflict.
 */
async function upsertSingleShipment(
  ctx: SyncContext,
  params: {
    defaultWarehouse: DefaultWarehouse | null;
    fulfillment: ShippingFulfillment;
    lineRefToId: Map<string, { id: string; quantity: number }>;
    orderId: string;
    orderShipping: OrderShippingAddress | null;
    organizationId: string;
  }
): Promise<boolean> {
  const {
    organizationId,
    orderId,
    fulfillment,
    lineRefToId,
    orderShipping,
    defaultWarehouse,
  } = params;
  if (!fulfillment.tracking) {
    return false;
  }

  // Hoist into a local so the narrowed `string` type survives the async
  // transaction callback closure below.
  const trackingNumber = fulfillment.tracking;

  // Per-shipment ship date — when the marketplace says this package was
  // handed off to the carrier. Distinct from order.shippedAt, which is
  // the marketplace's order-level summary.
  const shippedAt = fulfillment.shippedAt
    ? new Date(fulfillment.shippedAt)
    : null;

  // OOB import path: when this INSERT fires (no existing row matches
  // (orderId, reference)), the shipment is a marketplace-originated
  // fulfillment — the user shipped directly via the marketplace UI and
  // we never sent it. Tag it `source = 'marketplace'`. On conflict the
  // `source` column is intentionally NOT in the SET clause so a row that
  // started life as `source = 'local'` keeps its provenance.
  const [result] = await ctx.db
    .insert(shipment)
    .values({
      organizationId,
      orderId,
      source: "marketplace",
      reference: fulfillment.reference,
      carrier: fulfillment.carrier,
      method: fulfillment.method,
      tracking: fulfillment.tracking,
      shippedAt,
      shipToName: orderShipping?.shippingName,
      shipToCompany: orderShipping?.shippingCompany,
      shipToEmail: orderShipping?.shippingEmail,
      shipToPhone: orderShipping?.shippingPhone,
      shipToAddress1: orderShipping?.shippingAddress1,
      shipToAddress2: orderShipping?.shippingAddress2,
      shipToCity: orderShipping?.shippingCity,
      shipToState: orderShipping?.shippingState,
      shipToZipcode: orderShipping?.shippingZipCode,
      shipToCountry: orderShipping?.shippingCountry,
    })
    .onConflictDoUpdate({
      target: [shipment.orderId, shipment.reference],
      set: {
        carrier: fulfillment.carrier,
        method: fulfillment.method,
        tracking: fulfillment.tracking,
        shippedAt,
      },
    })
    .returning({ id: shipment.id });

  if (!result) {
    return false;
  }

  await backfillShipmentGeoFields(ctx, {
    shipmentId: result.id,
    orderShipping,
    defaultWarehouse,
  });

  // Keyed upsert against the unique (shipment_id, order_line_id) index:
  // each surviving line is written in place, lines no longer present in
  // the fulfillment are deleted. Idempotent under overlap — no
  // delete-then-reinsert window where the shipment has zero lines.
  const shipmentLinesByOrderLine = new Map<
    string,
    {
      organizationId: string;
      shipmentId: string;
      orderLineId: string;
      quantity: number;
    }
  >();
  for (const fLine of fulfillment.lineItems) {
    const orderLineInfo = lineRefToId.get(fLine.lineItemId);
    if (orderLineInfo) {
      // eBay returns quantity 0 in fulfillments — use the order line quantity
      const quantity =
        fLine.quantity > 0 ? fLine.quantity : orderLineInfo.quantity;
      const existing = shipmentLinesByOrderLine.get(orderLineInfo.id);
      if (existing) {
        existing.quantity += quantity;
      } else {
        shipmentLinesByOrderLine.set(orderLineInfo.id, {
          organizationId,
          shipmentId: result.id,
          orderLineId: orderLineInfo.id,
          quantity,
        });
      }
    }
  }

  await ctx.db.transaction(async (tx) => {
    const values = [...shipmentLinesByOrderLine.values()];
    if (values.length > 0) {
      await tx
        .insert(shipmentLine)
        .values(values)
        .onConflictDoUpdate({
          target: [shipmentLine.shipmentId, shipmentLine.orderLineId],
          set: {
            quantity: sql`excluded.quantity`,
            updatedAt: new Date(),
          },
        });
    }
    const keepOrderLineIds = [...shipmentLinesByOrderLine.keys()];
    await tx
      .delete(shipmentLine)
      .where(
        keepOrderLineIds.length > 0
          ? and(
              eq(shipmentLine.shipmentId, result.id),
              notInArray(shipmentLine.orderLineId, keepOrderLineIds)
            )
          : eq(shipmentLine.shipmentId, result.id)
      );
  });

  // Producer for the tracking poller: register this shipment's tracking
  // number on the `tracking` table with status "unknown". The poll cron
  // picks it up, calls the tracking provider, and fills in the rest.
  //
  // Reconciliation (transactional so a partial failure can't leave the
  // shipment with stale tracking rows or mixed events):
  //   1. If tracking changed for this shipment, drop the previous
  //      tracking row(s) — the cascade clears their events.
  //   2. If this (organizationId, trackingNumber) already exists pointing
  //      at a different shipment, wipe events from the prior context.
  //   3. Upsert the row, resetting status/provider so the poll cron picks
  //      the new shipment up again.
  await ctx.db.transaction(async (tx) => {
    await tx
      .delete(tracking)
      .where(
        and(
          eq(tracking.shipmentId, result.id),
          ne(tracking.trackingNumber, trackingNumber)
        )
      );

    const [existing] = await tx
      .select({ id: tracking.id, shipmentId: tracking.shipmentId })
      .from(tracking)
      .where(
        and(
          eq(tracking.organizationId, organizationId),
          eq(tracking.trackingNumber, trackingNumber)
        )
      );

    if (existing && existing.shipmentId !== result.id) {
      await tx
        .delete(trackingEvent)
        .where(eq(trackingEvent.trackingId, existing.id));
    }

    await tx
      .insert(tracking)
      .values({
        organizationId,
        shipmentId: result.id,
        provider: "package-tracker",
        trackingNumber,
        status: "unknown",
      })
      .onConflictDoUpdate({
        target: [tracking.organizationId, tracking.trackingNumber],
        set: {
          shipmentId: result.id,
          provider: "package-tracker",
          status: "unknown",
        },
      });
  });

  return true;
}

/**
 * Backfill `shipFrom*` (from the default warehouse) and
 * `shipToLatitude/Longitude` (via ctx.geo) for a shipment row. Each block
 * runs only if the corresponding column is currently null — safe to call
 * on every upsert.
 */
async function backfillShipmentGeoFields(
  ctx: SyncContext,
  params: {
    defaultWarehouse: DefaultWarehouse | null;
    orderShipping: OrderShippingAddress | null;
    shipmentId: string;
  }
): Promise<void> {
  const { shipmentId, orderShipping, defaultWarehouse } = params;

  const [current] = await ctx.db
    .select({
      shipFromAddress1: shipment.shipFromAddress1,
      shipToLatitude: shipment.shipToLatitude,
    })
    .from(shipment)
    .where(eq(shipment.id, shipmentId));
  if (!current) {
    return;
  }

  if (!current.shipFromAddress1 && defaultWarehouse) {
    await ctx.db
      .update(shipment)
      .set({
        warehouseId: defaultWarehouse.id,
        shipFromAddress1: defaultWarehouse.address1,
        shipFromAddress2: defaultWarehouse.address2,
        shipFromCity: defaultWarehouse.city,
        shipFromState: defaultWarehouse.state,
        shipFromZipcode: defaultWarehouse.zipcode,
        shipFromCountry: defaultWarehouse.country,
        shipFromLatitude: defaultWarehouse.latitude,
        shipFromLongitude: defaultWarehouse.longitude,
      })
      .where(eq(shipment.id, shipmentId));
  }

  if (current.shipToLatitude === null && orderShipping) {
    const coords = await ctx.geo
      .geocode({
        address1: orderShipping.shippingAddress1,
        address2: orderShipping.shippingAddress2,
        city: orderShipping.shippingCity,
        state: orderShipping.shippingState,
        zipcode: orderShipping.shippingZipCode,
        country: orderShipping.shippingCountry,
      })
      .catch((error: unknown) => {
        ctx.logger.warn("ship-to geocode failed", {
          shipmentId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
    if (coords) {
      await ctx.db
        .update(shipment)
        .set({
          shipToLatitude: coords.latitude,
          shipToLongitude: coords.longitude,
        })
        .where(eq(shipment.id, shipmentId));
    }
  }
}
