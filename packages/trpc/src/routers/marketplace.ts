import { db } from "@dashseller/db";
import { marketplace } from "@dashseller/db/schema";
import { getCursorParams } from "@sparkyidea/dataview/types";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure, router } from "../index";
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
 * Relation map for cross-table filtering on marketplaces.
 */
const marketplaceRelations: RelationMap = {};

export const marketplaceRouter = router({
  getOne: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const result = await db.query.marketplace.findFirst({
        where: (t, { eq }) => eq(t.id, input.id),
      });

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Marketplace not found",
        });
      }

      return result;
    }),

  getMany: publicProcedure
    .input(getManyInput.extend({ archived: z.boolean().default(false) }))
    .query(async ({ input }) => {
      const {
        archived,
        cursor,
        limit,
        search,
        filter,
        sort,
        groupBy,
        rollups,
      } = input;

      const { after, before } = getCursorParams(cursor);

      // Scope to non-archived by default
      const archivedWhere = eq(marketplace.archived, archived);

      // Build WHERE from filters and search
      const filterWhere = buildWhere(
        marketplace,
        filter,
        marketplaceRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchWhere = buildWhere(
        marketplace,
        searchQuery ? [searchQuery] : null,
        marketplaceRelations
      );

      // Build group WHERE (for grouped views with row context)
      const groupWhere = groupBy
        ? (buildGroupWhere(marketplace, groupBy.type, groupBy.key) ?? undefined)
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
      const { orderBy, cursorWhere } = buildCursor(marketplace, {
        sort: sortWithTiebreaker,
        cursor: cursorId,
        direction,
      });

      const where = and(
        archivedWhere,
        filterWhere,
        searchWhere,
        groupWhere,
        cursorWhere
      );

      const extras =
        rollups.length > 0
          ? buildRollupExtras(marketplaceRelations, rollups)
          : undefined;

      const items = await db.query.marketplace.findMany({
        where,
        orderBy,
        limit: limit + 1,
        extras,
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

  getManyByColumn: publicProcedure
    .input(
      getManyByColumnInput.extend({ archived: z.boolean().default(false) })
    )
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Loop with cursor handling requires conditionals
    .query(async ({ input }) => {
      const {
        archived,
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

      // Scope to non-archived by default
      const archivedWhere = eq(marketplace.archived, archived);

      // Build common WHERE clauses
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchWhere = buildWhere(
        marketplace,
        searchQuery ? [searchQuery] : null,
        marketplaceRelations
      );
      const filterWhere = buildWhere(
        marketplace,
        filter,
        marketplaceRelations,
        rollups
      );

      // Build row-level group WHERE (for board views with row grouping)
      const rowGroupWhere = groupBy
        ? (buildGroupWhere(marketplace, groupBy.type, groupBy.key) ?? undefined)
        : undefined;

      // Prepare sort with tiebreaker
      const primaryDirection = sort?.[0]?.direction ?? "desc";
      const sortWithTiebreaker: typeof sort =
        sort && sort.length > 0
          ? [...sort, { property: "id", direction: primaryDirection }]
          : [
              { property: "createdAt", direction: "desc" },
              { property: "id", direction: "desc" },
            ];

      // Determine which columns to fetch
      let columnKeysToFetch: string[];

      if (requestedColumnKeys && requestedColumnKeys.length > 0) {
        columnKeysToFetch = requestedColumnKeys;
      } else {
        const groupByResult = buildGroupBy(marketplace, columnBy);

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
          .from(marketplace)
          .where(and(archivedWhere, filterWhere, searchWhere, rowGroupWhere))
          .orderBy(orderBy);

        columnKeysToFetch = columnsResult.map((r) =>
          String(r.columnKey ?? `No ${columnBy.propertyId}`)
        );
      }

      // Fetch items for each column
      const allItems: (typeof marketplace.$inferSelect)[] = [];
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

        const columnWhere = buildGroupWhere(marketplace, columnBy, columnKey);

        if (!columnWhere) {
          continue;
        }

        const { orderBy, cursorWhere } = buildCursor(marketplace, {
          sort: sortWithTiebreaker,
          cursor,
          direction: "forward",
        });

        const data = await db.query.marketplace.findMany({
          where: and(
            archivedWhere,
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
              ? buildRollupExtras(marketplaceRelations, rollups)
              : undefined,
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

  getGroup: publicProcedure
    .input(getGroupInput.extend({ archived: z.boolean().default(false) }))
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cursor + hideEmpty conditionals
    .query(async ({ input }) => {
      const {
        archived,
        filter,
        groupBy,
        hideEmpty,
        search,
        sort = "asc",
        limit,
        cursor,
        rollups,
      } = input;
      const groupByResult = buildGroupBy(marketplace, groupBy);
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

      // Scope to non-archived by default
      const archivedWhere = eq(marketplace.archived, archived);

      // Build filter/search conditions
      const filterCondition = buildWhere(
        marketplace,
        filter ?? undefined,
        marketplaceRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchCondition = buildWhere(
        marketplace,
        searchQuery ? [searchQuery] : null,
        marketplaceRelations
      );
      const whereCondition = and(
        archivedWhere,
        filterCondition,
        searchCondition
      );

      // Get paginated distinct values
      // When hideEmpty is true, apply whereCondition to exclude groups with no matching items
      const distinctQuery = db
        .selectDistinct({ groupKey, sortValue: orderBy })
        .from(marketplace);

      // Always scope to archived state for security;
      // when hideEmpty, also apply filter/search to exclude empty groups
      const distinctBase = hideEmpty ? whereCondition : archivedWhere;
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
        .from(marketplace)
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
});
