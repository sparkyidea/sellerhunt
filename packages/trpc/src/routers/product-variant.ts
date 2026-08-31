import { db } from "@dashseller/db";
import { product, productVariant, stock } from "@dashseller/db/schema";
import { getCursorParams } from "@sparkyidea/dataview/types";
import { TRPCError } from "@trpc/server";
import { and, count, eq, sql } from "drizzle-orm";
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

const productVariantRelations: RelationMap = {
  stockItems: {
    table: stock,
    foreignKey: "productVariantId",
  },
  product: {
    table: product,
    foreignKey: "id",
    parentKey: "productId",
  },
};

export const productVariantRouter = router({
  create: orgProcedure
    .input(
      z.object({
        productId: z.string(),
        sku: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        upc: z.string().nullable().optional(),
        ean: z.string().nullable().optional(),
        isbn: z.string().nullable().optional(),
        gtin: z.string().nullable().optional(),
        price: z.number().int().min(0),
        weight: z.number().int().min(0),
        length: z.number().int().min(0),
        width: z.number().int().min(0),
        height: z.number().int().min(0),
        attributes: z.record(z.string(), z.string()).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { productId, ...data } = input;

      const productRecord = await db.query.product.findFirst({
        where: and(
          eq(product.id, productId),
          eq(product.organizationId, ctx.organizationId)
        ),
      });

      if (!productRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Product not found",
        });
      }

      const created = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(productVariant)
          .values({
            ...data,
            productId,
            organizationId: ctx.organizationId,
          })
          .returning();

        if (!inserted) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create variant",
          });
        }

        if (!productRecord.variant) {
          await tx
            .update(product)
            .set({ variant: true, updatedAt: new Date() })
            .where(eq(product.id, productId));
        }

        return inserted;
      });

      return created;
    }),

  update: orgProcedure
    .input(
      z.object({
        id: z.string(),
        sku: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        upc: z.string().nullable().optional(),
        ean: z.string().nullable().optional(),
        isbn: z.string().nullable().optional(),
        gtin: z.string().nullable().optional(),
        price: z.number().int().min(0).optional(),
        weight: z.number().int().min(0).optional(),
        length: z.number().int().min(0).optional(),
        width: z.number().int().min(0).optional(),
        height: z.number().int().min(0).optional(),
        attributes: z.record(z.string(), z.string()).nullable().optional(),
        imageUrls: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      const [updated] = await db
        .update(productVariant)
        .set({ ...patch, updatedAt: new Date() })
        .where(
          and(
            eq(productVariant.id, id),
            eq(productVariant.organizationId, ctx.organizationId)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Product variant not found",
        });
      }

      return updated;
    }),

  getOne: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await db.query.productVariant.findFirst({
        where: and(
          eq(productVariant.id, input.id),
          eq(productVariant.organizationId, ctx.organizationId)
        ),
        with: {
          product: true,
          stockItems: { with: { warehouse: true } },
        },
      });

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Product variant not found",
        });
      }

      return result;
    }),

  getNeighbors: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgWhere = eq(productVariant.organizationId, ctx.organizationId);
      // Scope neighbors to the same parent product as the current variant
      const sameProductWhere = sql`${productVariant.productId} = (SELECT ${productVariant.productId} FROM ${productVariant} WHERE ${productVariant.id} = ${input.id})`;
      const neighborSort = [
        { property: "createdAt", direction: "desc" } as const,
        { property: "id", direction: "desc" } as const,
      ];
      const prev = buildCursor(productVariant, {
        sort: neighborSort,
        cursor: input.id,
        direction: "backward",
      });
      const next = buildCursor(productVariant, {
        sort: neighborSort,
        cursor: input.id,
        direction: "forward",
      });

      const [prevRow, nextRow] = await Promise.all([
        db.query.productVariant.findFirst({
          where: and(orgWhere, sameProductWhere, prev.cursorWhere),
          orderBy: prev.orderBy,
          columns: { id: true },
        }),
        db.query.productVariant.findFirst({
          where: and(orgWhere, sameProductWhere, next.cursorWhere),
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

    const orgWhere = eq(productVariant.organizationId, ctx.organizationId);

    const filterWhere = buildWhere(
      productVariant,
      filter,
      productVariantRelations,
      rollups
    );
    const searchQuery = buildSearchFilter(
      search?.search ?? "",
      search?.searchFields ?? []
    );
    const searchWhere = buildWhere(
      productVariant,
      searchQuery ? [searchQuery] : null,
      productVariantRelations
    );

    const groupWhere = groupBy
      ? (buildGroupWhere(productVariant, groupBy.type, groupBy.key) ??
        undefined)
      : undefined;

    const primaryDirection = sort[0]?.direction ?? "desc";
    const sortWithTiebreaker = [
      ...sort,
      { property: "id", direction: primaryDirection } as const,
    ];

    const direction = before ? "backward" : "forward";
    const cursorId = after ?? before;
    const { orderBy, cursorWhere } = buildCursor(productVariant, {
      sort: sortWithTiebreaker,
      cursor: cursorId,
      direction,
    });

    const where = and(
      orgWhere,
      filterWhere,
      searchWhere,
      cursorWhere,
      groupWhere
    );

    const extras =
      rollups.length > 0
        ? buildRollupExtras(productVariantRelations, rollups)
        : undefined;

    const items = await db.query.productVariant.findMany({
      where,
      orderBy,
      limit: limit + 1,
      extras,
      with: {
        product: true,
        stockItems: true,
      },
    });

    const hasExtra = items.length > limit;
    if (hasExtra) {
      items.pop();
    }

    if (direction === "backward") {
      items.reverse();
    }

    flattenRelationArrays(items, ["stockItems", "product"]);

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
      const groupByResult = buildGroupBy(productVariant, groupBy);
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

      const orgWhere = eq(productVariant.organizationId, ctx.organizationId);

      const filterCondition = buildWhere(
        productVariant,
        filter ?? undefined,
        productVariantRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchCondition = buildWhere(
        productVariant,
        searchQuery ? [searchQuery] : null,
        productVariantRelations
      );
      const whereCondition = and(orgWhere, filterCondition, searchCondition);

      const distinctQuery = db
        .selectDistinct({ groupKey, sortValue: orderBy })
        .from(productVariant);

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
        .from(productVariant)
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
