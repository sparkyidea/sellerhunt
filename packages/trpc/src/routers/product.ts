import { db } from "@dashseller/db";
import {
  category,
  listing,
  product,
  productVariant,
} from "@dashseller/db/schema";
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
import { buildRollupExtras, flattenRelationArrays } from "../lib/build-rollup";
import { buildSearchFilter } from "../lib/build-search";
import { buildCursor } from "../lib/build-sort";
import { getGroupInput, getManyInput } from "../lib/schemas";

const productRelations: RelationMap = {
  productVariants: {
    table: productVariant,
    foreignKey: "productId",
  },
  listings: {
    table: listing,
    foreignKey: "productId",
  },
  category: {
    table: category,
    foreignKey: "id",
    parentKey: "categoryId",
  },
};

export const productRouter = router({
  update: orgProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(100_000).nullable().optional(),
        imageUrls: z.array(z.url()).max(30).nullable().optional(),
        categoryId: z.string().min(1).nullable().optional(),
        brand: z.string().nullable().optional(),
        manufacturer: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      const [updated] = await db
        .update(product)
        .set({ ...patch, updatedAt: new Date() })
        .where(
          and(
            eq(product.id, id),
            eq(product.organizationId, ctx.organizationId)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Product not found",
        });
      }

      return updated;
    }),

  getOne: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await db.query.product.findFirst({
        where: and(
          eq(product.id, input.id),
          eq(product.organizationId, ctx.organizationId)
        ),
        with: {
          productVariants: {
            with: {
              stockItems: {
                with: { warehouse: true },
              },
            },
          },
          category: true,
          listings: {
            with: { channel: true },
          },
        },
      });

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Product not found",
        });
      }

      return result;
    }),

  getNeighbors: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgWhere = eq(product.organizationId, ctx.organizationId);
      const neighborSort = [
        { property: "createdAt", direction: "desc" } as const,
        { property: "id", direction: "desc" } as const,
      ];
      const prev = buildCursor(product, {
        sort: neighborSort,
        cursor: input.id,
        direction: "backward",
      });
      const next = buildCursor(product, {
        sort: neighborSort,
        cursor: input.id,
        direction: "forward",
      });

      const [prevRow, nextRow] = await Promise.all([
        db.query.product.findFirst({
          where: and(orgWhere, prev.cursorWhere),
          orderBy: prev.orderBy,
          columns: { id: true },
        }),
        db.query.product.findFirst({
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

  getMany: orgProcedure
    .input(getManyInput.extend({ archived: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
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

      const orgWhere = eq(product.organizationId, ctx.organizationId);
      const archivedWhere = eq(product.archived, archived);

      const filterWhere = buildWhere(
        product,
        filter,
        productRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchWhere = buildWhere(
        product,
        searchQuery ? [searchQuery] : null,
        productRelations
      );

      const groupWhere = groupBy
        ? (buildGroupWhere(product, groupBy.type, groupBy.key) ?? undefined)
        : undefined;

      const primaryDirection = sort[0]?.direction ?? "desc";
      const sortWithTiebreaker = [
        ...sort,
        { property: "id", direction: primaryDirection } as const,
      ];

      const direction = before ? "backward" : "forward";
      const cursorId = after ?? before;
      const { orderBy, cursorWhere } = buildCursor(product, {
        sort: sortWithTiebreaker,
        cursor: cursorId,
        direction,
      });

      const where = and(
        orgWhere,
        archivedWhere,
        filterWhere,
        searchWhere,
        cursorWhere,
        groupWhere
      );

      const extras =
        rollups.length > 0
          ? buildRollupExtras(productRelations, rollups)
          : undefined;

      const items = await db.query.product.findMany({
        where,
        orderBy,
        limit: limit + 1,
        extras,
        with: {
          productVariants: true,
          listings: true,
          category: true,
        },
      });

      const hasExtra = items.length > limit;
      if (hasExtra) {
        items.pop();
      }

      if (direction === "backward") {
        items.reverse();
      }

      flattenRelationArrays(items, ["productVariants", "listings", "category"]);

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
    .input(getGroupInput.extend({ archived: z.boolean().default(false) }))
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cursor + hideEmpty conditionals
    .query(async ({ ctx, input }) => {
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
      const groupByResult = buildGroupBy(product, groupBy);
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

      const orgWhere = eq(product.organizationId, ctx.organizationId);
      const archivedWhere = eq(product.archived, archived);

      const filterCondition = buildWhere(
        product,
        filter ?? undefined,
        productRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchCondition = buildWhere(
        product,
        searchQuery ? [searchQuery] : null,
        productRelations
      );
      const whereCondition = and(
        orgWhere,
        archivedWhere,
        filterCondition,
        searchCondition
      );

      const distinctQuery = db
        .selectDistinct({ groupKey, sortValue: orderBy })
        .from(product);

      const distinctBase = hideEmpty
        ? whereCondition
        : and(orgWhere, archivedWhere);
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
        .from(product)
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
