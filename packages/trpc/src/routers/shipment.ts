import { db } from "@dashseller/db";
import {
  order,
  orderLine,
  shipment,
  shipmentLine,
  syncOutbox,
  tracking,
  trackingEvent,
  warehouse,
} from "@dashseller/db/schema";
import { env } from "@dashseller/env/server";
import { createGeocoder } from "@dashseller/geo";
import { getCursorParams } from "@sparkyidea/dataview/types";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { orgProcedure, router } from "../index";
import { buildWhere, type RelationMap } from "../lib/build-filter";
import {
  buildGroupBy,
  buildGroupCursor,
  buildGroupWhere,
} from "../lib/build-group";
import { buildRollupExtras, flattenRelationArrays } from "../lib/build-rollup";
import { buildSearchFilter } from "../lib/build-search";
import { buildCursor } from "../lib/build-sort";
import { getGroupInput, getManyInput } from "../lib/schemas";

const shipmentLineSchema = z.object({
  orderLineId: z.string(),
  quantity: z.number().int().positive(),
});

const createShipmentInput = z.object({
  orderId: z.string(),
  warehouseId: z.string().min(1),
  carrier: z.string(),
  tracking: z.string(),
  lines: z.array(shipmentLineSchema).min(1),
  shipToName: z.string().nullish(),
  shipToCompany: z.string().nullish(),
  shipToEmail: z.string().nullish(),
  shipToPhone: z.string().nullish(),
  shipToAddress1: z.string().nullish(),
  shipToAddress2: z.string().nullish(),
  shipToCity: z.string().nullish(),
  shipToState: z.string().nullish(),
  shipToZipcode: z.string().nullish(),
  shipToCountry: z.string().nullish(),
});

/**
 * Relation map for cross-table filtering and rollup on shipments.
 */
const shipmentRelations: RelationMap = {
  shipmentLines: { table: shipmentLine, foreignKey: "shipmentId" },
  trackings: { table: tracking, foreignKey: "shipmentId" },
};

export const shipmentRouter = router({
  getNeighbors: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgWhere = eq(shipment.organizationId, ctx.organizationId);
      const neighborSort = [
        { property: "createdAt", direction: "desc" } as const,
        { property: "id", direction: "desc" } as const,
      ];
      const prev = buildCursor(shipment, {
        sort: neighborSort,
        cursor: input.id,
        direction: "backward",
      });
      const next = buildCursor(shipment, {
        sort: neighborSort,
        cursor: input.id,
        direction: "forward",
      });

      const [prevRow, nextRow] = await Promise.all([
        db.query.shipment.findFirst({
          where: and(orgWhere, prev.cursorWhere),
          orderBy: prev.orderBy,
          columns: { id: true },
        }),
        db.query.shipment.findFirst({
          where: and(orgWhere, next.cursorWhere),
          orderBy: next.orderBy,
          columns: { id: true },
        }),
      ]);

      return {
        prevId: prevRow?.id ?? null,
        nextId: nextRow?.id ?? null,
      };
    }),

  getOne: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await db.query.shipment.findFirst({
        where: and(
          eq(shipment.id, input.id),
          eq(shipment.organizationId, ctx.organizationId)
        ),
        with: {
          order: true,
          shipmentLines: {
            with: { orderLine: true },
          },
          trackings: {
            with: {
              events: {
                orderBy: (e) => [desc(e.statusDate)],
              },
            },
          },
        },
      });
      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shipment not found",
        });
      }
      return result;
    }),

  getMany: orgProcedure.input(getManyInput).query(async ({ ctx, input }) => {
    const { cursor, limit, search, filter, sort, groupBy, rollups } = input;

    const { after, before } = getCursorParams(cursor);

    // Scope to current organization
    const orgWhere = eq(shipment.organizationId, ctx.organizationId);

    // Build WHERE from filters and search
    const filterWhere = buildWhere(
      shipment,
      filter,
      shipmentRelations,
      rollups
    );
    const searchQuery = buildSearchFilter(
      search?.search ?? "",
      search?.searchFields ?? []
    );
    const searchWhere = buildWhere(
      shipment,
      searchQuery ? [searchQuery] : null,
      shipmentRelations
    );

    // Build group WHERE (for grouped views with row context)
    const groupWhere = groupBy
      ? (buildGroupWhere(shipment, groupBy.type, groupBy.key) ?? undefined)
      : undefined;

    // Determine primary direction and append tiebreaker
    const primaryDirection = sort[0]?.direction ?? "desc";
    const sortWithTiebreaker = [
      ...sort,
      { property: "id", direction: primaryDirection } as const,
    ];

    // Cursor pagination
    const direction = before ? "backward" : "forward";
    const cursorId = after ?? before;
    const { orderBy, cursorWhere } = buildCursor(shipment, {
      sort: sortWithTiebreaker,
      cursor: cursorId,
      direction,
    });

    const where = and(
      orgWhere,
      filterWhere,
      searchWhere,
      groupWhere,
      cursorWhere
    );

    const extras =
      rollups.length > 0
        ? buildRollupExtras(shipmentRelations, rollups)
        : undefined;

    const items = await db.query.shipment.findMany({
      where,
      orderBy,
      limit: limit + 1,
      extras,
      with: {
        order: true,
        shipmentLines: true,
        trackings: {
          // Each shipment has 0 or 1 tracking in practice (one tracking
          // number per shipment). The relation is `many` because the FK
          // on tracking doesn't have a unique constraint; we treat the
          // first row as canonical for table display.
          limit: 1,
        },
      },
    });

    const hasExtra = items.length > limit;
    if (hasExtra) {
      items.pop();
    }

    if (direction === "backward") {
      items.reverse();
    }

    // Flatten relation arrays so dataview rollup keys (e.g.
    // "trackings.status") resolve via the `relation.field` lookup
    // pattern.
    flattenRelationArrays(items, ["shipmentLines", "trackings"]);

    const startCursor = items[0]?.id ?? null;
    const endCursor = items.at(-1)?.id ?? null;

    return {
      items,
      startCursor,
      endCursor,
      hasNextPage: direction === "forward" ? hasExtra : !!before,
      hasPreviousPage: direction === "backward" ? hasExtra : !!after,
    };
  }),

  getGroup: orgProcedure
    .input(getGroupInput)
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cursor + hideEmpty conditionals
    .query(async ({ ctx, input }) => {
      const {
        filter,
        groupBy,
        hideEmpty,
        search,
        sort = "asc",
        limit,
        cursor,
        rollups,
      } = input;
      const groupByResult = buildGroupBy(shipment, groupBy);
      if (!groupByResult) {
        return {
          counts: {},
          sortValues: {},
          nextCursor: null,
          hasNextPage: false,
        };
      }

      const { groupKey, orderBy } = groupByResult;
      const { orderByClause, cursorFilter } = buildGroupCursor({
        orderBy,
        cursor,
        sort,
      });

      // Scope to current organization
      const orgWhere = eq(shipment.organizationId, ctx.organizationId);

      // Build filter/search conditions
      const filterCondition = buildWhere(
        shipment,
        filter ?? undefined,
        shipmentRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchCondition = buildWhere(
        shipment,
        searchQuery ? [searchQuery] : null,
        shipmentRelations
      );
      const whereCondition = and(orgWhere, filterCondition, searchCondition);

      // Get paginated distinct values
      const distinctQuery = db
        .selectDistinct({ groupKey, sortValue: orderBy })
        .from(shipment);

      const distinctBase = hideEmpty ? whereCondition : orgWhere;
      const distinctCondition = cursorFilter
        ? and(distinctBase, cursorFilter)
        : distinctBase;

      const distinctResults = await distinctQuery
        .where(distinctCondition)
        .orderBy(orderByClause)
        .limit(limit + 1);

      const hasNextPage = distinctResults.length > limit;
      const groups = hasNextPage
        ? distinctResults.slice(0, limit)
        : distinctResults;

      // Get filtered counts
      const countsResult = await db
        .select({ groupKey, count: count() })
        .from(shipment)
        .where(whereCondition)
        .groupBy(groupKey);

      const countsMap = new Map<string, number>();
      for (const row of countsResult) {
        const key =
          row.groupKey instanceof Date
            ? row.groupKey.toISOString()
            : String(row.groupKey ?? `No ${groupBy.propertyId}`);
        countsMap.set(key, Number(row.count));
      }

      // Build output
      const counts: Record<string, { count: number; hasMore: boolean }> = {};
      const sortValues: Record<string, string | number> = {};

      for (const row of groups) {
        const key =
          row.groupKey instanceof Date
            ? row.groupKey.toISOString()
            : String(row.groupKey ?? `No ${groupBy.propertyId}`);
        const rawCount = countsMap.get(key) ?? 0;

        if (hideEmpty && rawCount === 0) {
          continue;
        }

        counts[key] = {
          count: Math.min(rawCount, 100),
          hasMore: rawCount > 100,
        };
        sortValues[key] =
          typeof row.sortValue === "number"
            ? row.sortValue
            : String(row.sortValue ?? key);
      }

      const lastGroup = groups.at(-1);
      const nextCursor =
        hasNextPage && lastGroup
          ? String(lastGroup.sortValue ?? lastGroup.groupKey)
          : null;

      return { counts, sortValues, nextCursor, hasNextPage };
    }),

  create: orgProcedure
    .input(createShipmentInput)
    .mutation(async ({ ctx, input }) => {
      const organizationId = ctx.organizationId;

      // Fetch the order to get channelId and verify ownership.
      const orderRecord = await db.query.order.findFirst({
        where: and(
          eq(order.id, input.orderId),
          eq(order.organizationId, organizationId)
        ),
      });

      if (!orderRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      if (!orderRecord.channelId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Order has no associated channel",
        });
      }

      // Reject a second create for the same order. The in-flight outbox
      // blocker prevents duplicate pushes, but if the prior shipment is
      // already `confirmed`, the blocker is past and a naive retry would
      // silently create a duplicate shipment row.
      const [existingShipment] = await db
        .select({ id: shipment.id })
        .from(shipment)
        .where(eq(shipment.orderId, input.orderId))
        .limit(1);
      if (existingShipment) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A shipment already exists for this order",
        });
      }

      // Fetch the warehouse — server is the source of truth for
      // ship-from. Caller-provided ship-from would be ignored even
      // if the schema accepted it, so the input doesn't expose
      // those fields. Warehouse ownership is enforced via organizationId.
      const warehouseRecord = await db.query.warehouse.findFirst({
        where: and(
          eq(warehouse.id, input.warehouseId),
          eq(warehouse.organizationId, organizationId)
        ),
      });

      if (!warehouseRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Warehouse not found",
        });
      }

      // Validate line items belong to this order.
      const orderLineIds = input.lines.map((l) => l.orderLineId);
      const orderLines = await db
        .select({
          id: orderLine.id,
          orderId: orderLine.orderId,
          reference: orderLine.reference,
        })
        .from(orderLine)
        .where(
          and(
            inArray(orderLine.id, orderLineIds),
            eq(orderLine.orderId, input.orderId)
          )
        );

      if (orderLines.length !== orderLineIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "One or more line items do not belong to the specified order",
        });
      }

      const lineItems = input.lines.map((line) => {
        const orderLineRecord = orderLines.find(
          (ol) => ol.id === line.orderLineId
        );
        return {
          lineItemId: orderLineRecord?.reference ?? line.orderLineId,
          quantity: line.quantity,
        };
      });

      const payload = {
        tracking: input.tracking,
        carrier: input.carrier,
        lineItems,
      };

      const { channelId } = orderRecord;

      // Geocode ship-to ahead of the transaction — best-effort, the
      // network call shouldn't hold a DB transaction open and a
      // null result shouldn't roll back the shipment insert. Errors
      // are logged (so a Rollo outage is visible) but never block.
      const shipToCoords = await createGeocoder("rollo", {
        apiKey: env.ROLLO_API_KEY,
      })
        .geocode({
          address1: input.shipToAddress1,
          address2: input.shipToAddress2,
          city: input.shipToCity,
          state: input.shipToState,
          zipcode: input.shipToZipcode,
          country: input.shipToCountry,
        })
        .catch((error: unknown) => {
          console.warn("ship-to geocode failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        });

      // Create shipment, shipment lines, tracking row, and outbox row
      // in a single transaction.
      try {
        const result = await db.transaction(async (tx) => {
          const [newShipment] = await tx
            .insert(shipment)
            .values({
              organizationId,
              createdByUserId: ctx.userId,
              orderId: input.orderId,
              source: "local",
              warehouseId: warehouseRecord.id,
              carrier: input.carrier,
              tracking: input.tracking,
              shipFromAddress1: warehouseRecord.address1,
              shipFromAddress2: warehouseRecord.address2,
              shipFromCity: warehouseRecord.city,
              shipFromState: warehouseRecord.state,
              shipFromZipcode: warehouseRecord.zipcode,
              shipFromCountry: warehouseRecord.country,
              shipFromLatitude: warehouseRecord.latitude,
              shipFromLongitude: warehouseRecord.longitude,
              shipToName: input.shipToName,
              shipToCompany: input.shipToCompany,
              shipToEmail: input.shipToEmail,
              shipToPhone: input.shipToPhone,
              shipToAddress1: input.shipToAddress1,
              shipToAddress2: input.shipToAddress2,
              shipToCity: input.shipToCity,
              shipToState: input.shipToState,
              shipToZipcode: input.shipToZipcode,
              shipToCountry: input.shipToCountry,
              shipToLatitude: shipToCoords?.latitude ?? null,
              shipToLongitude: shipToCoords?.longitude ?? null,
            })
            .returning({ id: shipment.id });

          if (!newShipment) {
            throw new Error("Failed to create shipment");
          }

          await tx.insert(shipmentLine).values(
            input.lines.map((line) => ({
              organizationId,
              shipmentId: newShipment.id,
              orderLineId: line.orderLineId,
              quantity: line.quantity,
            }))
          );

          // Register the tracking number with the tracking table so the
          // poll-tracking cron can pick it up. If a tracking row already
          // exists for this number, mirror the pull-orders reconciliation:
          // wipe events from the prior shipment context so they don't
          // render under the new one, and reset `status`/`provider` on
          // conflict — otherwise the cron's terminal-status filter would
          // skip the new shipment forever.
          const [existingTracking] = await tx
            .select({ id: tracking.id, shipmentId: tracking.shipmentId })
            .from(tracking)
            .where(
              and(
                eq(tracking.organizationId, organizationId),
                eq(tracking.trackingNumber, input.tracking)
              )
            );

          if (
            existingTracking &&
            existingTracking.shipmentId !== newShipment.id
          ) {
            await tx
              .delete(trackingEvent)
              .where(eq(trackingEvent.trackingId, existingTracking.id));
          }

          await tx
            .insert(tracking)
            .values({
              organizationId,
              shipmentId: newShipment.id,
              provider: "package-tracker",
              trackingNumber: input.tracking,
              status: "unknown",
            })
            .onConflictDoUpdate({
              target: [tracking.organizationId, tracking.trackingNumber],
              set: {
                shipmentId: newShipment.id,
                provider: "package-tracker",
                status: "unknown",
              },
            });

          const [outboxRow] = await tx
            .insert(syncOutbox)
            .values({
              organizationId,
              channelId,
              entityType: "order",
              entityId: orderRecord.id,
              action: "createShipment",
              sourceId: newShipment.id,
              payload,
              status: "pending",
            })
            .returning({
              id: syncOutbox.id,
              claimGeneration: syncOutbox.claimGeneration,
            });

          if (!outboxRow) {
            throw new Error("Failed to create sync outbox row");
          }

          return {
            shipmentId: newShipment.id,
            outboxId: outboxRow.id,
            generation: outboxRow.claimGeneration,
          };
        });

        // Post-commit enqueue of the fenced push job. A failure (Redis
        // down) still reports success: the row is pending and the outbox
        // drainer recovers it — Postgres is the durable boundary.
        try {
          await ctx.jobs.enqueueSyncShipment({
            outboxId: result.outboxId,
            generation: result.generation,
          });
        } catch (error) {
          console.warn(
            "sync-shipment enqueue failed (drainer will recover):",
            error instanceof Error ? error.message : error
          );
        }

        return { shipmentId: result.shipmentId, outboxId: result.outboxId };
      } catch (error) {
        // Handle unique partial index rejection (another sync already in progress)
        if (
          error instanceof Error &&
          error.message.includes("sync_outbox_entity_blocker_idx")
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A sync operation is already in progress for this order. Please wait for it to complete.",
          });
        }
        throw error;
      }
    }),
});
