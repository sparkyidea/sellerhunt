import { db } from "@dashseller/db";
import { issue } from "@dashseller/db/schema";
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
 * Relation map for cross-table filtering on issues.
 */
const issueRelations: RelationMap = {};

export const issueRouter = router({
  getOne: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await db.query.issue.findFirst({
        where: and(
          eq(issue.id, input.id),
          eq(issue.organizationId, ctx.organizationId)
        ),
        with: {
          order: true,
        },
      });

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Issue not found",
        });
      }

      return result;
    }),

  getMany: orgProcedure.input(getManyInput).query(async ({ ctx, input }) => {
    const { cursor, limit, search, filter, sort, groupBy, rollups } = input;

    const { after, before } = getCursorParams(cursor);

    // Scope to current organization
    const orgWhere = eq(issue.organizationId, ctx.organizationId);

    // Build WHERE from filters and search
    const filterWhere = buildWhere(issue, filter, issueRelations, rollups);
    const searchQuery = buildSearchFilter(
      search?.search ?? "",
      search?.searchFields ?? []
    );
    const searchWhere = buildWhere(
      issue,
      searchQuery ? [searchQuery] : null,
      issueRelations
    );

    // Build group WHERE (for grouped views with row context)
    const groupWhere = groupBy
      ? (buildGroupWhere(issue, groupBy.type, groupBy.key) ?? undefined)
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
    const { orderBy, cursorWhere } = buildCursor(issue, {
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
        ? buildRollupExtras(issueRelations, rollups)
        : undefined;

    const items = await db.query.issue.findMany({
      where,
      orderBy,
      limit: limit + 1,
      extras,
      with: {
        order: true,
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

      // Scope to current organization
      const orgWhere = eq(issue.organizationId, ctx.organizationId);

      // Build common WHERE clauses
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchWhere = buildWhere(
        issue,
        searchQuery ? [searchQuery] : null,
        issueRelations
      );
      const filterWhere = buildWhere(issue, filter, issueRelations, rollups);

      // Build row-level group WHERE (for board views with row grouping)
      const rowGroupWhere = groupBy
        ? (buildGroupWhere(issue, groupBy.type, groupBy.key) ?? undefined)
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
        const groupByResult = buildGroupBy(issue, columnBy);

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
          .from(issue)
          .where(and(orgWhere, filterWhere, searchWhere, rowGroupWhere))
          .orderBy(orderBy);

        columnKeysToFetch = columnsResult.map((r) =>
          String(r.columnKey ?? `No ${columnBy.propertyId}`)
        );
      }

      // Fetch items for each column
      const allItems: (typeof issue.$inferSelect)[] = [];
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

        const columnWhere = buildGroupWhere(issue, columnBy, columnKey);

        if (!columnWhere) {
          continue;
        }

        const { orderBy, cursorWhere } = buildCursor(issue, {
          sort: sortWithTiebreaker,
          cursor,
          direction: "forward",
        });

        const data = await db.query.issue.findMany({
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
              ? buildRollupExtras(issueRelations, rollups)
              : undefined,
          with: {
            order: true,
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
      const groupByResult = buildGroupBy(issue, groupBy);
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
      const orgWhere = eq(issue.organizationId, ctx.organizationId);

      // Build filter/search conditions
      const filterCondition = buildWhere(
        issue,
        filter ?? undefined,
        issueRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchCondition = buildWhere(
        issue,
        searchQuery ? [searchQuery] : null,
        issueRelations
      );
      const whereCondition = and(orgWhere, filterCondition, searchCondition);

      // Get paginated distinct values
      const distinctQuery = db
        .selectDistinct({ groupKey, sortValue: orderBy })
        .from(issue);

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
        .from(issue)
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
