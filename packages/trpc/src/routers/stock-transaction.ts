import { db } from "@dashseller/db";
import { stock, stockTransaction } from "@dashseller/db/schema/inventory";
import { getCursorParams } from "@sparkyidea/dataview/types";
import { and, count, eq, inArray } from "drizzle-orm";
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
import { getGroupInput, getManyInput } from "../lib/schemas";

const stockTransactionRelations: RelationMap = {
  stock: {
    table: stock,
    foreignKey: "id",
    parentKey: "stockId",
  },
};

export const stockTransactionRouter = router({
  getMany: orgProcedure
    .input(
      getManyInput.extend({
        productVariantId: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const {
        cursor,
        limit,
        search,
        filter,
        sort,
        groupBy,
        rollups,
        productVariantId,
      } = input;

      const { after, before } = getCursorParams(cursor);

      const orgWhere = eq(stockTransaction.organizationId, ctx.organizationId);

      const productVariantWhere = productVariantId
        ? inArray(
            stockTransaction.stockId,
            db
              .select({ id: stock.id })
              .from(stock)
              .where(eq(stock.productVariantId, productVariantId))
          )
        : undefined;

      const filterWhere = buildWhere(
        stockTransaction,
        filter,
        stockTransactionRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchWhere = buildWhere(
        stockTransaction,
        searchQuery ? [searchQuery] : null,
        stockTransactionRelations
      );

      const groupWhere = groupBy
        ? (buildGroupWhere(stockTransaction, groupBy.type, groupBy.key) ??
          undefined)
        : undefined;

      const primaryDirection = sort[0]?.direction ?? "desc";
      const sortWithTiebreaker = [
        ...sort,
        { property: "id", direction: primaryDirection } as const,
      ];

      const direction = before ? "backward" : "forward";
      const cursorId = after ?? before;
      const { orderBy, cursorWhere } = buildCursor(stockTransaction, {
        sort: sortWithTiebreaker,
        cursor: cursorId,
        direction,
      });

      const where = and(
        orgWhere,
        productVariantWhere,
        filterWhere,
        searchWhere,
        cursorWhere,
        groupWhere
      );

      const extras =
        rollups.length > 0
          ? buildRollupExtras(stockTransactionRelations, rollups)
          : undefined;

      const items = await db.query.stockTransaction.findMany({
        where,
        orderBy,
        limit: limit + 1,
        extras,
        with: {
          stock: {
            with: {
              productVariant: {
                with: {
                  product: true,
                },
              },
              warehouse: true,
            },
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
    .input(
      getGroupInput.extend({
        productVariantId: z.string().nullish(),
      })
    )
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
        productVariantId,
      } = input;

      const groupByResult = buildGroupBy(stockTransaction, groupBy);
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

      const orgWhere = eq(stockTransaction.organizationId, ctx.organizationId);

      const productVariantWhere = productVariantId
        ? inArray(
            stockTransaction.stockId,
            db
              .select({ id: stock.id })
              .from(stock)
              .where(eq(stock.productVariantId, productVariantId))
          )
        : undefined;

      const filterCondition = buildWhere(
        stockTransaction,
        filter ?? undefined,
        stockTransactionRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchCondition = buildWhere(
        stockTransaction,
        searchQuery ? [searchQuery] : null,
        stockTransactionRelations
      );
      const whereCondition = and(
        orgWhere,
        productVariantWhere,
        filterCondition,
        searchCondition
      );

      const distinctQuery = db
        .selectDistinct({ groupKey, sortValue: orderBy })
        .from(stockTransaction);

      const distinctBase = hideEmpty
        ? whereCondition
        : and(orgWhere, productVariantWhere);
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
        .from(stockTransaction)
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
