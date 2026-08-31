import { db } from "@dashseller/db";
import { stock, stockTransaction } from "@dashseller/db/schema/inventory";
import { productVariant } from "@dashseller/db/schema/product";
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
import { getGroupInput, getManyInput } from "../lib/schemas";

const stockRelations: RelationMap = {};

export const stockRouter = router({
  create: orgProcedure
    .input(
      z.object({
        productVariantId: z.string(),
        warehouseId: z.string(),
        quantity: z.number().int().min(0).default(0),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const variant = await db.query.productVariant.findFirst({
        where: and(
          eq(productVariant.id, input.productVariantId),
          eq(productVariant.organizationId, ctx.organizationId)
        ),
        columns: { id: true },
      });

      if (!variant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Product variant not found",
        });
      }

      return await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(stock)
          .values({
            organizationId: ctx.organizationId,
            productVariantId: input.productVariantId,
            warehouseId: input.warehouseId,
            quantity: input.quantity,
          })
          .returning();

        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create stock",
          });
        }

        if (input.quantity > 0) {
          await tx.insert(stockTransaction).values({
            organizationId: ctx.organizationId,
            createdByUserId: ctx.userId,
            stockId: created.id,
            type: "receive",
            quantity: input.quantity,
            note: input.note ?? null,
          });
        }

        return created;
      });
    }),

  update: orgProcedure
    .input(
      z.object({
        id: z.string(),
        quantity: z.number().int().min(0),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stockRecord = await db.query.stock.findFirst({
        where: and(
          eq(stock.id, input.id),
          eq(stock.organizationId, ctx.organizationId)
        ),
      });

      if (!stockRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Stock record not found",
        });
      }

      const delta = input.quantity - stockRecord.quantity;
      // A CONFIRMING count (delta 0) still supersedes the seed — only
      // skip the write when there is nothing to change at all.
      if (delta === 0 && stockRecord.seedBasis === null) {
        return stockRecord;
      }

      return await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(stock)
          .set({
            quantity: input.quantity,
            // A manual count supersedes the marketplace-derived opening
            // balance — clear the seed provenance so the sync baseline
            // rule can never uplift a hand-counted quantity.
            seedBasis: null,
            seedObservedAt: null,
            seedObservedUpperAt: null,
            updatedAt: new Date(),
          })
          .where(eq(stock.id, input.id))
          .returning();

        if (delta !== 0) {
          await tx.insert(stockTransaction).values({
            organizationId: ctx.organizationId,
            createdByUserId: ctx.userId,
            stockId: input.id,
            type: "adjust",
            quantity: delta,
            note: input.note ?? null,
          });
        }

        return updated;
      });
    }),

  getOne: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await db.query.stock.findFirst({
        where: and(
          eq(stock.id, input.id),
          eq(stock.organizationId, ctx.organizationId)
        ),
        with: {
          warehouse: true,
          productVariant: true,
        },
      });

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Stock record not found",
        });
      }

      return result;
    }),

  getMany: orgProcedure.input(getManyInput).query(async ({ ctx, input }) => {
    const { cursor, limit, search, filter, sort, groupBy, rollups } = input;

    const { after, before } = getCursorParams(cursor);

    const orgWhere = eq(stock.organizationId, ctx.organizationId);

    const filterWhere = buildWhere(stock, filter, stockRelations, rollups);
    const searchQuery = buildSearchFilter(
      search?.search ?? "",
      search?.searchFields ?? []
    );
    const searchWhere = buildWhere(
      stock,
      searchQuery ? [searchQuery] : null,
      stockRelations
    );

    const groupWhere = groupBy
      ? (buildGroupWhere(stock, groupBy.type, groupBy.key) ?? undefined)
      : undefined;

    const primaryDirection = sort[0]?.direction ?? "desc";
    const sortWithTiebreaker = [
      ...sort,
      { property: "id", direction: primaryDirection } as const,
    ];

    const direction = before ? "backward" : "forward";
    const cursorId = after ?? before;
    const { orderBy, cursorWhere } = buildCursor(stock, {
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
        ? buildRollupExtras(stockRelations, rollups)
        : undefined;

    const items = await db.query.stock.findMany({
      where,
      orderBy,
      limit: limit + 1,
      extras,
      with: {
        warehouse: true,
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
      const groupByResult = buildGroupBy(stock, groupBy);
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

      const orgWhere = eq(stock.organizationId, ctx.organizationId);

      const filterCondition = buildWhere(
        stock,
        filter ?? undefined,
        stockRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchCondition = buildWhere(
        stock,
        searchQuery ? [searchQuery] : null,
        stockRelations
      );
      const whereCondition = and(orgWhere, filterCondition, searchCondition);

      const distinctQuery = db
        .selectDistinct({ groupKey, sortValue: orderBy })
        .from(stock);

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
        .from(stock)
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
