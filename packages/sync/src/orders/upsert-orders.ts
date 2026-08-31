import {
  channel,
  issue,
  listing,
  listingVariant,
  order,
  orderLine,
  product,
  productVariant,
} from "@dashseller/db/schema";
import type { Order, ShippingFulfillment } from "@dashseller/marketplace/types";
import { deriveFulfilledQuantities } from "@dashseller/marketplace/utils";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { SyncContext } from "../context";
import { applyOrderLineEffects } from "./inventory";
import {
  type DefaultWarehouse,
  resolveDefaultWarehouse,
  upsertOrderShipments,
} from "./shipments";

export interface UpsertOrdersResult {
  /** Sync conflicts recorded during the inventory pass (run still succeeds;
   * the domain sync-state row keeps the latest conflict message). */
  conflicts: number;
  errors: Array<{ reference: string; error: string }>;
  newOrders: number;
  shipmentsUpserted: number;
  /** Snapshots rejected by the source-version stale guard (children skipped). */
  staleRejected: number;
  totalProcessed: number;
  updatedOrders: number;
}

/**
 * Seams owned by the caller:
 * - outbox pull-protection arrives as callbacks so the shell wires the
 *   fenced protocol (`../outbox/protection.ts`) without this module
 *   depending on it;
 * - fulfillments come through a port so tests inject fixtures and callers
 *   share one fetch between inventory derivation and shipment upserts.
 */
export interface OrdersUpsertPorts {
  /**
   * Returns per-order failures rather than throwing: a confirmation that
   * could not be attempted must surface as a run error so the retry /
   * watermark-holdback machinery re-runs it. Dropping it silently would
   * let the conflict sweep escalate a push that actually succeeded.
   */
  captureRemoteEvidence?(
    protectedOrderIds: Set<string>,
    existingOrders: Array<{ id: string; reference: string | null }>,
    orders: Order[]
  ): Promise<Array<{ error: string; reference: string }>>;
  getFulfillments?(orderReference: string): Promise<ShippingFulfillment[]>;
  getProtectedEntityIds?(orderIds: string[]): Promise<Set<string>>;
}

export interface UpsertOrdersInput {
  channelId: string;
  orders: Order[];
  ports?: OrdersUpsertPorts;
}

type OrderStatus = NonNullable<Order["status"]>;

type IssueStatus =
  | "open"
  | "under_review"
  | "approved"
  | "rejected"
  | "resolved"
  | "escalated";

type IssueResolution =
  | "refunded"
  | "replaced"
  | "repaired"
  | "denied"
  | "credited"
  | "cancelled";

function buildOrderValues(
  organizationId: string,
  channelId: string,
  ordersData: Order[]
) {
  return ordersData
    .filter((o) => o.reference)
    .map((o) => ({
      organizationId,
      channelId,
      reference: o.reference,
      orderNumber: o.orderNumber,
      customerUsername: o.customerUsername,
      billingName: o.billing.name,
      billingCompany: o.billing.company,
      billingEmail: o.billing.email,
      billingPhone: o.billing.phone,
      billingAddress1: o.billing.address1,
      billingAddress2: o.billing.address2,
      billingCity: o.billing.city,
      billingState: o.billing.state,
      billingZipCode: o.billing.zipCode,
      shippingName: o.shipping.name,
      shippingCompany: o.shipping.company,
      shippingEmail: o.shipping.email,
      shippingPhone: o.shipping.phone,
      shippingAddress1: o.shipping.address1,
      shippingAddress2: o.shipping.address2,
      shippingCity: o.shipping.city,
      shippingState: o.shipping.state,
      shippingZipCode: o.shipping.zipCode,
      subtotal: o.subtotal,
      shippingCost: o.shippingCost,
      discount: o.discount,
      tax: o.tax,
      total: o.total,
      currency: o.currency,
      orderedAt: o.orderedAt,
      status: o.status as OrderStatus,
      paidAt: o.paidAt,
      paymentMethod: o.paymentMethod,
      shippedAt: o.shippedAt,
      shipBy: o.shipBy,
      deliverBy: o.deliverBy,
      deliveredAt: o.deliveredAt,
      requestedShippingCarrier: o.requestedShippingCarrier,
      requestedShippingMethod: o.requestedShippingMethod,
      customerNote: o.customerNote,
      sellerNote: o.sellerNote,
      sourceVersionAt: o.sourceVersionAt,
    }));
}

function buildOrderLineValues(
  organizationId: string,
  ordersData: Order[],
  orderMap: Map<string, string>,
  variantProductMap: Map<string, ResolvedVariant>
) {
  const values: Array<{
    organizationId: string;
    orderId: string;
    reference: string;
    title: string | null;
    imageUrl: string | null;
    quantity: number | null;
    sku: string | null;
    unitPrice: number | null;
    discount: number | null;
    tax: number | null;
    total: number | null;
    listingVariantId: string | null;
    productVariantId: string | null;
    listingVariantReference: string | null;
  }> = [];

  for (const orderData of ordersData) {
    const orderId = orderMap.get(orderData.reference);
    if (!orderId) {
      continue;
    }

    for (const line of orderData.orderLines) {
      if (!line.reference) {
        continue;
      }

      const resolved = line.listingVariantReference
        ? (variantProductMap.get(line.listingVariantReference) ?? null)
        : null;

      values.push({
        organizationId,
        orderId,
        reference: line.reference,
        title: resolved?.title ?? line.title,
        imageUrl: resolved?.imageUrl ?? null,
        quantity: line.quantity,
        sku: line.sku,
        unitPrice: line.unitPrice,
        discount: line.discount,
        tax: line.tax,
        total: line.total,
        listingVariantId: resolved?.listingVariantId ?? null,
        productVariantId: resolved?.productVariantId ?? null,
        // Stored even when unresolved (empty string → null, mirroring
        // resolveVariantProducts' filter) so late-link repair can re-sync
        // the order once its listing exists.
        listingVariantReference: line.listingVariantReference || null,
      });
    }
  }

  return values;
}

function upsertOrderRows(
  ctx: SyncContext,
  orderValues: ReturnType<typeof buildOrderValues>,
  protectedOrderIds: Set<string>
) {
  const hasProtected = protectedOrderIds.size > 0;
  // `::text`, NOT `::uuid`: the ids originate from `sync_outbox.entity_id`
  // (a uuid column) but are compared against `order.id`, which is `text`.
  // Postgres has no `text = uuid` operator, so a uuid array makes the whole
  // upsert throw 42883 the moment any order is protected.
  const protectedArray = hasProtected
    ? sql`ARRAY[${sql.join(
        [...protectedOrderIds].map((id) => sql`${id}::text`),
        sql`, `
      )}]`
    : null;

  // For protected fields, keep existing value when the order has in-flight
  // outbox rows. Otherwise, take the new value from EXCLUDED.
  const protectedField = (
    columnName: string,
    existingColumnRef: string = columnName
  ) => {
    if (!(hasProtected && protectedArray)) {
      return sql.raw(`EXCLUDED.${columnName}`);
    }
    return sql`CASE WHEN "order".id = ANY(${protectedArray}) THEN "order".${sql.raw(existingColumnRef)} ELSE EXCLUDED.${sql.raw(columnName)} END`;
  };

  return ctx.db
    .insert(order)
    .values(orderValues)
    .onConflictDoUpdate({
      target: [order.organizationId, order.channelId, order.reference],
      set: {
        orderNumber: sql`EXCLUDED.order_number`,
        customerUsername: sql`EXCLUDED.customer_username`,
        billingName: sql`EXCLUDED.billing_name`,
        billingCompany: sql`EXCLUDED.billing_company`,
        billingEmail: sql`EXCLUDED.billing_email`,
        billingPhone: sql`EXCLUDED.billing_phone`,
        billingAddress1: sql`EXCLUDED.billing_address_1`,
        billingAddress2: sql`EXCLUDED.billing_address_2`,
        billingCity: sql`EXCLUDED.billing_city`,
        billingState: sql`EXCLUDED.billing_state`,
        billingZipCode: sql`EXCLUDED.billing_zip_code`,
        shippingName: sql`EXCLUDED.shipping_name`,
        shippingCompany: sql`EXCLUDED.shipping_company`,
        shippingEmail: sql`EXCLUDED.shipping_email`,
        shippingPhone: sql`EXCLUDED.shipping_phone`,
        shippingAddress1: sql`EXCLUDED.shipping_address_1`,
        shippingAddress2: sql`EXCLUDED.shipping_address_2`,
        shippingCity: sql`EXCLUDED.shipping_city`,
        shippingState: sql`EXCLUDED.shipping_state`,
        shippingZipCode: sql`EXCLUDED.shipping_zip_code`,
        subtotal: sql`EXCLUDED.subtotal`,
        shippingCost: sql`EXCLUDED.shipping_cost`,
        discount: sql`EXCLUDED.discount`,
        tax: sql`EXCLUDED.tax`,
        total: sql`EXCLUDED.total`,
        currency: sql`EXCLUDED.currency`,
        orderedAt: sql`EXCLUDED.ordered_at`,
        status: protectedField("status"),
        paidAt: sql`EXCLUDED.paid_at`,
        paymentMethod: sql`EXCLUDED.payment_method`,
        shippedAt: protectedField("shipped_at"),
        shipBy: sql`EXCLUDED.ship_by`,
        deliverBy: sql`EXCLUDED.deliver_by`,
        deliveredAt: sql`EXCLUDED.delivered_at`,
        requestedShippingCarrier: sql`EXCLUDED.requested_shipping_carrier`,
        requestedShippingMethod: sql`EXCLUDED.requested_shipping_method`,
        customerNote: sql`EXCLUDED.customer_note`,
        sellerNote: sql`EXCLUDED.seller_note`,
        sourceVersionAt: sql`EXCLUDED.source_version_at`,
        // A successful pull proves the order exists remotely again.
        remoteMissingAt: sql`NULL`,
        updatedAt: sql`NOW()`,
      },
      // Stale guard: an existing row with a NEWER provider clock rejects the
      // whole update. A rejected row is absent from RETURNING, which is what
      // aborts ALL child writes for that order — lines, issues, inventory,
      // shipments all key off the returned map. A version-less incoming
      // snapshot loses against any versioned row (NULL comparison rejects),
      // so it can never wipe a newer row's clock.
      setWhere: sql`"order".source_version_at IS NULL OR "order".source_version_at <= EXCLUDED.source_version_at`,
    })
    .returning({
      id: order.id,
      reference: order.reference,
    });
}

function upsertOrderLineRows(
  ctx: SyncContext,
  values: ReturnType<typeof buildOrderLineValues>
) {
  if (values.length === 0) {
    return;
  }

  return ctx.db
    .insert(orderLine)
    .values(values)
    .onConflictDoUpdate({
      target: [orderLine.orderId, orderLine.reference],
      set: {
        title: sql`EXCLUDED.title`,
        imageUrl: sql`COALESCE(EXCLUDED.image_url, order_line.image_url)`,
        quantity: sql`EXCLUDED.quantity`,
        sku: sql`EXCLUDED.sku`,
        unitPrice: sql`EXCLUDED.unit_price`,
        discount: sql`EXCLUDED.discount`,
        tax: sql`EXCLUDED.tax`,
        total: sql`EXCLUDED.total`,
        listingVariantId: sql`COALESCE(EXCLUDED.listing_variant_id, order_line.listing_variant_id)`,
        productVariantId: sql`COALESCE(EXCLUDED.product_variant_id, order_line.product_variant_id)`,
        // Resolved lines keep their stored reference (bookkeeping only).
        // UNRESOLVED lines take the fresh value verbatim — both adapters
        // emit a reference whenever the remote variant is alive, so an
        // incoming NULL means the variant is gone and a re-pull can never
        // link; keeping the stale reference would make late-link repair
        // re-enqueue the order after every listings run forever.
        listingVariantReference: sql`CASE WHEN order_line.listing_variant_id IS NOT NULL THEN COALESCE(EXCLUDED.listing_variant_reference, order_line.listing_variant_reference) ELSE EXCLUDED.listing_variant_reference END`,
        updatedAt: sql`NOW()`,
      },
    });
}

interface ResolvedVariant {
  imageUrl: string | null;
  listingVariantId: string;
  productVariantId: string;
  title: string;
}

/**
 * Batch-resolve listing variant references to productVariantIds and product
 * titles, scoped to the channel via the listing join.
 */
async function resolveVariantProducts(
  ctx: SyncContext,
  channelId: string,
  ordersData: Order[]
): Promise<Map<string, ResolvedVariant>> {
  const refs = ordersData
    .flatMap((o) => o.orderLines.map((l) => l.listingVariantReference))
    .filter((ref): ref is string => ref !== null && ref !== "");

  if (refs.length === 0) {
    return new Map();
  }

  const uniqueRefs = [...new Set(refs)];
  const matches = await ctx.db
    .select({
      reference: listingVariant.reference,
      listingVariantId: listingVariant.id,
      productVariantId: listingVariant.productVariantId,
      productTitle: product.title,
      attributes: productVariant.attributes,
      imageUrls: productVariant.imageUrls,
    })
    .from(listingVariant)
    .innerJoin(listing, eq(listingVariant.listingId, listing.id))
    .innerJoin(
      productVariant,
      eq(listingVariant.productVariantId, productVariant.id)
    )
    .innerJoin(product, eq(productVariant.productId, product.id))
    .where(
      and(
        eq(listing.channelId, channelId),
        inArray(listingVariant.reference, uniqueRefs)
      )
    );

  const map = new Map<string, ResolvedVariant>();
  for (const match of matches) {
    if (match.reference && match.productVariantId) {
      const attributeLabel = match.attributes
        ? Object.values(match.attributes).join(", ")
        : null;
      const title = attributeLabel
        ? `${match.productTitle}${attributeLabel}`
        : match.productTitle;

      map.set(match.reference, {
        listingVariantId: match.listingVariantId,
        productVariantId: match.productVariantId,
        title,
        imageUrl: match.imageUrls?.[0] ?? null,
      });
    }
  }
  return map;
}

/**
 * Orders whose fulfillment list is needed for inventory and/or shipments.
 * Cancellation/refund/return statuses MASK fulfillment status in both
 * adapters, so they are included — a canceled-after-partial-fulfillment
 * order still needs its fulfilled quantities to keep the shipped portion's
 * inventory claim.
 */
function needsFulfillments(orderData: Order): boolean {
  return (
    orderData.shipped ||
    orderData.status === "partially_fulfilled" ||
    orderData.status === "fulfilled" ||
    orderData.status === "completed" ||
    orderData.status === "canceled" ||
    orderData.status === "refunded" ||
    orderData.status === "returned"
  );
}

async function fetchFulfillments(
  ordersData: Order[],
  orderMap: Map<string, string>,
  ports: OrdersUpsertPorts,
  errors: Array<{ reference: string; error: string }>
): Promise<{
  fetchFailed: Set<string>;
  fulfillmentsByRef: Map<string, ShippingFulfillment[]>;
}> {
  const fulfillmentsByRef = new Map<string, ShippingFulfillment[]>();
  const fetchFailed = new Set<string>();
  if (!ports.getFulfillments) {
    return { fetchFailed, fulfillmentsByRef };
  }
  for (const orderData of ordersData) {
    if (!(orderMap.has(orderData.reference) && needsFulfillments(orderData))) {
      continue;
    }
    try {
      fulfillmentsByRef.set(
        orderData.reference,
        await ports.getFulfillments(orderData.reference)
      );
    } catch (error) {
      fetchFailed.add(orderData.reference);
      errors.push({
        reference: orderData.reference,
        error:
          error instanceof Error ? error.message : "Fulfillment fetch failed",
      });
    }
  }
  return { fetchFailed, fulfillmentsByRef };
}

async function processShipments(
  ctx: SyncContext,
  params: {
    errors: Array<{ reference: string; error: string }>;
    fulfillmentsByRef: Map<string, ShippingFulfillment[]>;
    orderMap: Map<string, string>;
    ordersData: Order[];
    organizationId: string;
  }
): Promise<number> {
  let shipmentsUpserted = 0;
  let defaultWarehouse: DefaultWarehouse | null | undefined;
  for (const orderData of params.ordersData) {
    if (!orderData.shipped) {
      continue;
    }
    const orderId = params.orderMap.get(orderData.reference);
    const fulfillments = params.fulfillmentsByRef.get(orderData.reference);
    if (!(orderId && fulfillments) || fulfillments.length === 0) {
      continue;
    }
    if (defaultWarehouse === undefined) {
      defaultWarehouse = await resolveDefaultWarehouse(
        ctx,
        params.organizationId
      );
    }
    try {
      shipmentsUpserted += await upsertOrderShipments(ctx, {
        organizationId: params.organizationId,
        orderId,
        fulfillments,
        defaultWarehouse,
      });
    } catch (error) {
      params.errors.push({
        reference: orderData.reference,
        error:
          error instanceof Error ? error.message : "Shipment upsert failed",
      });
    }
  }
  return shipmentsUpserted;
}

/** Latest fulfillment reference, as the ledger's provider transition id. */
function latestFulfillmentRef(
  fulfillments: ShippingFulfillment[]
): string | null {
  let latest: ShippingFulfillment | null = null;
  for (const f of fulfillments) {
    if (
      !latest ||
      (f.shippedAt ?? "").localeCompare(latest.shippedAt ?? "") >= 0
    ) {
      latest = f;
    }
  }
  return latest?.reference ?? null;
}

/**
 * Inventory pass: for every fresh (non-stale) order, reduce provider line
 * state (activeQuantity + cumulative fulfilled) to counter deltas and apply
 * them. Conflicts are recorded per line and never abort siblings.
 */
async function processInventory(
  ctx: SyncContext,
  params: {
    channelId: string;
    /** Orders whose fulfillment fetch FAILED — skipped entirely; the run
     * error keeps the watermark held so they are re-pulled. */
    fetchFailed: Set<string>;
    fulfillmentsByRef: Map<string, ShippingFulfillment[]>;
    orderMap: Map<string, string>;
    ordersData: Order[];
    organizationId: string;
  }
): Promise<{
  conflicts: number;
  errors: Array<{ reference: string; error: string }>;
}> {
  const errors: Array<{ reference: string; error: string }> = [];
  let conflicts = 0;
  const orderIds = [...params.orderMap.values()];
  if (orderIds.length === 0) {
    return { conflicts, errors };
  }

  const lines = await ctx.db
    .select({
      id: orderLine.id,
      orderId: orderLine.orderId,
      reference: orderLine.reference,
      productVariantId: orderLine.productVariantId,
      warehouseId: orderLine.warehouseId,
    })
    .from(orderLine)
    .where(inArray(orderLine.orderId, orderIds));
  const linesByOrderId = new Map<string, typeof lines>();
  for (const line of lines) {
    if (!line.orderId) {
      continue;
    }
    const list = linesByOrderId.get(line.orderId) ?? [];
    list.push(line);
    linesByOrderId.set(line.orderId, list);
  }

  for (const orderData of params.ordersData) {
    const orderId = params.orderMap.get(orderData.reference);
    if (!orderId || params.fetchFailed.has(orderData.reference)) {
      continue;
    }
    const outcome = await applyInventoryForOrder(ctx, {
      channelId: params.channelId,
      dbLines: linesByOrderId.get(orderId) ?? [],
      fetched: params.fulfillmentsByRef.get(orderData.reference),
      orderData,
      organizationId: params.organizationId,
    });
    conflicts += outcome.conflicts;
    errors.push(...outcome.errors);
  }
  return { conflicts, errors };
}

interface InventoryLineRow {
  id: string;
  orderId: string | null;
  productVariantId: string | null;
  reference: string | null;
  warehouseId: string | null;
}

async function applyInventoryForOrder(
  ctx: SyncContext,
  params: {
    channelId: string;
    dbLines: InventoryLineRow[];
    fetched: ShippingFulfillment[] | undefined;
    orderData: Order;
    organizationId: string;
  }
): Promise<{
  conflicts: number;
  errors: Array<{ reference: string; error: string }>;
}> {
  const { orderData, fetched } = params;
  const errors: Array<{ reference: string; error: string }> = [];
  let conflicts = 0;

  // Fulfillment knowledge is tri-state: fetched (exact quantities),
  // known-empty (order never had fulfillment activity — target 0), or
  // unknown (needed but no port) — unknown passes NULL so the applied
  // counter stands in and shipped units are never un-fulfilled.
  const fulfillmentsKnown =
    fetched !== undefined || !needsFulfillments(orderData);
  const fulfillments = fetched ?? [];
  const fulfilledByLine = deriveFulfilledQuantities(orderData, fulfillments);
  const effectRef = latestFulfillmentRef(fulfillments);
  const dbLineByReference = new Map(
    params.dbLines
      .filter(
        (l): l is InventoryLineRow & { reference: string } =>
          l.reference !== null
      )
      .map((l) => [l.reference, l])
  );

  for (const line of orderData.orderLines) {
    const dbLine = dbLineByReference.get(line.reference);
    // An unresolved line stores its listingVariantReference and gets no
    // inventory effect; the relink pass re-syncs the order once the
    // listing world exists.
    if (!dbLine?.productVariantId) {
      continue;
    }
    try {
      const outcome = await applyOrderLineEffects(ctx, {
        orderLineId: dbLine.id,
        organizationId: params.organizationId,
        channelId: params.channelId,
        productVariantId: dbLine.productVariantId,
        warehouseId: dbLine.warehouseId,
        activeQuantity: line.activeQuantity,
        orderedQuantity: line.quantity,
        targetFulfilled: fulfillmentsKnown
          ? (fulfilledByLine.get(line.reference) ?? 0)
          : null,
        effectRef,
        orderedAt: orderData.orderedAt,
        sourceVersionAt: orderData.sourceVersionAt,
      });
      conflicts += outcome.conflictsRecorded;
    } catch (error) {
      errors.push({
        reference: orderData.reference,
        error:
          error instanceof Error ? error.message : "Inventory apply failed",
      });
    }
  }
  return { conflicts, errors };
}

/**
 * Upsert cancellation issues for orders with cancelState changes.
 */
async function upsertCancelIssueForOrder(
  ctx: SyncContext,
  organizationId: string,
  channelId: string,
  orderId: string,
  orderData: Order
) {
  if (orderData.cancelState === "IN_PROGRESS") {
    await ctx.db
      .insert(issue)
      .values({
        organizationId,
        channelId,
        orderId,
        type: "cancellation" as const,
        status: "open" as IssueStatus,
        reason: orderData.cancellationReason,
      })
      .onConflictDoUpdate({
        target: [issue.orderId, issue.type],
        set: {
          reason: sql`EXCLUDED.reason`,
          updatedAt: sql`NOW()`,
        },
      });
  } else if (orderData.cancelState === "CANCELED") {
    await ctx.db
      .insert(issue)
      .values({
        organizationId,
        channelId,
        orderId,
        type: "cancellation" as const,
        status: "resolved" as IssueStatus,
        resolution: "cancelled" as IssueResolution,
        reason: orderData.cancellationReason,
        resolvedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [issue.orderId, issue.type],
        set: {
          status: sql`'resolved'`,
          resolution: sql`'cancelled'`,
          resolvedAt: sql`NOW()`,
          updatedAt: sql`NOW()`,
        },
      });
  } else if (orderData.cancelState === "NONE_REQUESTED") {
    await ctx.db
      .update(issue)
      .set({
        status: "resolved" as IssueStatus,
        resolution: "denied" as IssueResolution,
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(issue.orderId, orderId),
          eq(issue.type, "cancellation"),
          eq(issue.status, "open")
        )
      );
  }
}

async function upsertCancellationIssues(
  ctx: SyncContext,
  organizationId: string,
  channelId: string,
  ordersData: Order[],
  orderMap: Map<string, string>
) {
  for (const orderData of ordersData) {
    const orderId = orderMap.get(orderData.reference);
    if (!orderId) {
      continue;
    }
    await upsertCancelIssueForOrder(
      ctx,
      organizationId,
      channelId,
      orderId,
      orderData
    );
  }

  const canceledOrderIds = ordersData
    .filter((o) => o.cancelState === "CANCELED")
    .map((o) => orderMap.get(o.reference))
    .filter((id): id is string => id != null);

  if (canceledOrderIds.length > 0) {
    await ctx.db
      .update(order)
      .set({ status: "canceled" as OrderStatus })
      .where(inArray(order.id, canceledOrderIds));
  }
}

/**
 * Upsert one batch of marketplace orders.
 *
 * 1. Resolve channel/organization; look up existing orders and in-flight
 *    outbox protection (via ports)
 * 2. UPSERT orders — stale-guarded on source_version_at; protected fields
 *    kept for orders with in-flight outbox rows
 * 3. UPSERT order lines (fresh orders only — stale parents abort children)
 * 4. UPSERT cancellation issues
 * 5. Inventory pass: counter-derived deltas per line
 * 6. Shipment upserts for shipped orders, sharing the fulfillment fetch
 */
export async function upsertOrders(
  ctx: SyncContext,
  input: UpsertOrdersInput
): Promise<UpsertOrdersResult> {
  const { channelId, orders: ordersData, ports = {} } = input;
  if (ordersData.length === 0) {
    return {
      totalProcessed: 0,
      newOrders: 0,
      updatedOrders: 0,
      shipmentsUpserted: 0,
      staleRejected: 0,
      conflicts: 0,
      errors: [],
    };
  }

  const errors: Array<{ reference: string; error: string }> = [];

  const [channelData] = await ctx.db
    .select({ organizationId: channel.organizationId })
    .from(channel)
    .where(eq(channel.id, channelId))
    .limit(1);

  if (!channelData?.organizationId) {
    throw new Error(`Channel not found or has no organizationId: ${channelId}`);
  }
  const { organizationId } = channelData;

  const orderReferences = ordersData
    .map((o) => o.reference)
    .filter((ref): ref is string => Boolean(ref));

  const existingOrders = await ctx.db
    .select({ id: order.id, reference: order.reference })
    .from(order)
    .where(
      and(
        eq(order.organizationId, organizationId),
        eq(order.channelId, channelId),
        inArray(order.reference, orderReferences)
      )
    );

  const existingOrderIds = existingOrders
    .filter((o): o is { id: string; reference: string } => o.reference !== null)
    .map((o) => o.id);

  const protectedOrderIds =
    (await ports.getProtectedEntityIds?.(existingOrderIds)) ??
    new Set<string>();

  errors.push(
    ...((await ports.captureRemoteEvidence?.(
      protectedOrderIds,
      existingOrders,
      ordersData
    )) ?? [])
  );

  const orderValues = buildOrderValues(organizationId, channelId, ordersData);

  let upsertedOrders: Array<{ id: string; reference: string | null }>;
  try {
    upsertedOrders = await upsertOrderRows(ctx, orderValues, protectedOrderIds);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Order upsert failed";
    for (const orderData of ordersData) {
      errors.push({ reference: orderData.reference || "unknown", error: msg });
    }
    return {
      totalProcessed: 0,
      newOrders: 0,
      updatedOrders: 0,
      shipmentsUpserted: 0,
      staleRejected: 0,
      conflicts: 0,
      errors,
    };
  }

  const staleRejected = orderValues.length - upsertedOrders.length;
  if (staleRejected > 0) {
    ctx.logger.info("Stale order snapshots rejected", {
      channelId,
      staleRejected,
    });
  }

  const orderMap = new Map(
    upsertedOrders
      .filter((o) => o.reference !== null)
      .map((o) => [o.reference as string, o.id])
  );

  const variantProductMap = await resolveVariantProducts(
    ctx,
    channelId,
    ordersData
  );

  const orderLineValues = buildOrderLineValues(
    organizationId,
    ordersData,
    orderMap,
    variantProductMap
  );

  try {
    await upsertOrderLineRows(ctx, orderLineValues);
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Order line upsert failed";
    for (const lineValue of orderLineValues) {
      errors.push({ reference: lineValue.reference, error: msg });
    }
  }

  try {
    await upsertCancellationIssues(
      ctx,
      organizationId,
      channelId,
      ordersData,
      orderMap
    );
  } catch (error) {
    errors.push({
      reference: "issues",
      error: error instanceof Error ? error.message : "Issue upsert failed",
    });
  }

  // One fulfillment fetch per order, shared by inventory + shipments. A
  // failed fetch marks the order unknown: its inventory AND shipments are
  // skipped this run, and the recorded error keeps the run non-successful
  // so the watermark holds and the order is re-pulled.
  const { fetchFailed, fulfillmentsByRef } = await fetchFulfillments(
    ordersData,
    orderMap,
    ports,
    errors
  );

  const inventory = await processInventory(ctx, {
    channelId,
    organizationId,
    ordersData,
    orderMap,
    fulfillmentsByRef,
    fetchFailed,
  });
  errors.push(...inventory.errors);

  const shipmentsUpserted = await processShipments(ctx, {
    errors,
    fulfillmentsByRef,
    orderMap,
    ordersData,
    organizationId,
  });

  const newOrders = upsertedOrders.filter(
    (o) => !existingOrderIds.includes(o.id)
  ).length;

  return {
    totalProcessed: ordersData.length,
    newOrders,
    updatedOrders: upsertedOrders.length - newOrders,
    shipmentsUpserted,
    staleRejected,
    conflicts: inventory.conflicts,
    errors,
  };
}
