import { db } from "@dashseller/db";
import { listingVariant, order, orderLine } from "@dashseller/db/schema";
import { getCursorParams } from "@sparkyidea/dataview/types";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { orgProcedure, router } from "../index";
import { buildWhere, type RelationMap } from "../lib/build-filter";
import {
  buildGroupBy,
  buildGroupCursor,
  buildGroupWhere,
} from "../lib/build-group";
import { buildRollupExtras } from "../lib/build-rollup";
import { buildSearchFilter } from "../lib/build-search";
import { buildCursor } from "../lib/build-sort";
import {
  getGroupInput,
  getManyByColumnInput,
  getManyInput,
} from "../lib/schemas";

/**
 * Relation map for cross-table filtering / rollups on order lines.
 *
 * - `order` is many-to-one (orderLine.orderId → order.id). We model that by
 *   pointing `parentKey` at orderLine's FK column and `foreignKey` at the
 *   parent's PK — so the EXISTS subquery joins on `order.id = orderLine.orderId`.
 *   Enables filters like `order.archived`, `order.orderedAt`, `order.channelId`.
 * - `listingVariant` joins on orderLine.listingVariantId → listingVariant.id.
 *   Enables filters like `listingVariant.listingId` for "all orderLines under
 *   this listing" and `listingVariant.id` for "all orderLines under this
 *   specific variant". The FK is required here (not the marketplace reference)
 *   because `listingVariant.reference` is only unique within a listing.
 */
const orderLineRelations: RelationMap = {
  order: {
    table: order,
    foreignKey: "id",
    parentKey: "orderId",
  },
  listingVariant: {
    table: listingVariant,
    foreignKey: "id",
    parentKey: "listingVariantId",
  },
};

export const orderLineRouter = router({
  getOne: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await db.query.orderLine.findFirst({
        where: and(
          eq(orderLine.id, input.id),
          eq(orderLine.organizationId, ctx.organizationId)
        ),
        with: {
          order: true,
          productVariant: true,
        },
      });

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order line not found",
        });
      }

      return result;
    }),

  getNeighbors: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgWhere = eq(orderLine.organizationId, ctx.organizationId);
      const neighborSort = [
        { property: "createdAt", direction: "desc" } as const,
        { property: "id", direction: "desc" } as const,
      ];
      const prev = buildCursor(orderLine, {
        sort: neighborSort,
        cursor: input.id,
        direction: "backward",
      });
      const next = buildCursor(orderLine, {
        sort: neighborSort,
        cursor: input.id,
        direction: "forward",
      });

      const [prevRow, nextRow] = await Promise.all([
        db.query.orderLine.findFirst({
          where: and(orgWhere, prev.cursorWhere),
          orderBy: prev.orderBy,
          columns: { id: true },
        }),
        db.query.orderLine.findFirst({
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

  getMany: orgProcedure.input(getManyInput).query(async ({ ctx, input }) => {
    const { cursor, limit, search, filter, sort, groupBy, rollups } = input;

    const { after, before } = getCursorParams(cursor);

    const orgWhere = eq(orderLine.organizationId, ctx.organizationId);

    const filterWhere = buildWhere(
      orderLine,
      filter,
      orderLineRelations,
      rollups
    );
    const searchQuery = buildSearchFilter(
      search?.search ?? "",
      search?.searchFields ?? []
    );
    const searchWhere = buildWhere(
      orderLine,
      searchQuery ? [searchQuery] : null,
      orderLineRelations
    );

    const groupWhere = groupBy
      ? (buildGroupWhere(orderLine, groupBy.type, groupBy.key) ?? undefined)
      : undefined;

    const primaryDirection = sort[0]?.direction ?? "desc";
    const sortWithTiebreaker = [
      ...sort,
      { property: "id", direction: primaryDirection } as const,
    ];

    const direction = before ? "backward" : "forward";
    const cursorId = after ?? before;
    const { orderBy, cursorWhere } = buildCursor(orderLine, {
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
        ? buildRollupExtras(orderLineRelations, rollups)
        : undefined;

    const items = await db.query.orderLine.findMany({
      where,
      orderBy,
      limit: limit + 1,
      extras,
      with: {
        order: {
          with: {
            channel: {
              with: { marketplace: true },
            },
          },
        },
        productVariant: true,
      },
    });

    const hasExtra = items.length > limit;
    if (hasExtra) {
      items.pop();
    }

    if (direction === "backward") {
      items.reverse();
    }

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

  getManyByColumn: orgProcedure
    .input(getManyByColumnInput)
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Loop with cursor handling requires conditionals
    .query(async ({ ctx, input }) => {
      const {
        columnBy,
        limit,
        cursor: cursors,
        filter,
        sort,
        search,
        columnKeys: requestedColumnKeys,
        groupBy,
        rollups,
      } = input;

      const orgWhere = eq(orderLine.organizationId, ctx.organizationId);

      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchWhere = buildWhere(
        orderLine,
        searchQuery ? [searchQuery] : null,
        orderLineRelations
      );
      const filterWhere = buildWhere(
        orderLine,
        filter,
        orderLineRelations,
        rollups
      );

      const rowGroupWhere = groupBy
        ? (buildGroupWhere(orderLine, groupBy.type, groupBy.key) ?? undefined)
        : undefined;

      const primaryDirection = sort?.[0]?.direction ?? "desc";
      const sortWithTiebreaker: typeof sort =
        sort && sort.length > 0
          ? [...sort, { property: "id", direction: primaryDirection }]
          : [
              { property: "createdAt", direction: "desc" },
              { property: "id", direction: "desc" },
            ];

      let columnKeysToFetch: string[];

      if (requestedColumnKeys && requestedColumnKeys.length > 0) {
        columnKeysToFetch = requestedColumnKeys;
      } else {
        const groupByResult = buildGroupBy(orderLine, columnBy);

        if (!groupByResult) {
          return {
            items: [],
            startCursor: {},
            endCursor: {},
            hasNextPage: {},
            hasPreviousPage: {},
          };
        }

        const { groupKey: columnKeyExpr, orderBy } = groupByResult;

        const columnsResult = await db
          .selectDistinct({ columnKey: columnKeyExpr, sortValue: orderBy })
          .from(orderLine)
          .where(and(orgWhere, filterWhere, searchWhere, rowGroupWhere))
          .orderBy(orderBy);

        columnKeysToFetch = columnsResult.map((r) =>
          String(r.columnKey ?? `No ${columnBy.propertyId}`)
        );
      }

      const allItems: (typeof orderLine.$inferSelect)[] = [];
      const startCursor: Record<string, string | null> = {};
      const endCursor: Record<string, string | null> = {};
      const hasNextPage: Record<string, boolean> = {};
      const hasPreviousPage: Record<string, boolean> = {};
      const seenIds = new Set<string>();

      for (const columnKey of columnKeysToFetch) {
        const cursor = cursors[columnKey];

        if (cursor === null) {
          startCursor[columnKey] = null;
          endCursor[columnKey] = null;
          hasNextPage[columnKey] = false;
          hasPreviousPage[columnKey] = true;
          continue;
        }

        const columnWhere = buildGroupWhere(orderLine, columnBy, columnKey);

        if (!columnWhere) {
          continue;
        }

        const { orderBy, cursorWhere } = buildCursor(orderLine, {
          sort: sortWithTiebreaker,
          cursor,
          direction: "forward",
        });

        const data = await db.query.orderLine.findMany({
          where: and(
            orgWhere,
            filterWhere,
            searchWhere,
            cursorWhere,
            columnWhere,
            rowGroupWhere
          ),
          orderBy,
          limit: limit + 1,
          extras:
            rollups.length > 0
              ? buildRollupExtras(orderLineRelations, rollups)
              : undefined,
          with: {
            order: true,
            productVariant: true,
          },
        });

        const hasMore = data.length > limit;
        const items = hasMore ? data.slice(0, -1) : data;
        const firstItem = items[0];
        const lastItem = items.at(-1);

        startCursor[columnKey] = firstItem ? String(firstItem.id) : null;
        endCursor[columnKey] = lastItem ? String(lastItem.id) : null;
        hasNextPage[columnKey] = hasMore;
        hasPreviousPage[columnKey] = !!cursor;

        for (const item of items) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            allItems.push(item);
          }
        }
      }

      return {
        items: allItems,
        startCursor,
        endCursor,
        hasNextPage,
        hasPreviousPage,
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

      const groupByResult = buildGroupBy(orderLine, groupBy);
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

      const orgWhere = eq(orderLine.organizationId, ctx.organizationId);

      const filterCondition = buildWhere(
        orderLine,
        filter ?? undefined,
        orderLineRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchCondition = buildWhere(
        orderLine,
        searchQuery ? [searchQuery] : null,
        orderLineRelations
      );
      const whereCondition = and(orgWhere, filterCondition, searchCondition);

      const distinctQuery = db
        .selectDistinct({ groupKey, sortValue: orderBy })
        .from(orderLine);

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

      const countsResult = await db
        .select({ groupKey, count: count() })
        .from(orderLine)
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
});
