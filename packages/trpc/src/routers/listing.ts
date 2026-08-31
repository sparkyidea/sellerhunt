import { db } from "@dashseller/db";
import { listing, listingVariant } from "@dashseller/db/schema";
import { channel } from "@dashseller/db/schema/channel";
import { marketplaceCategory } from "@dashseller/db/schema/marketplace-category";
import { getCursorParams } from "@sparkyidea/dataview/types";
import { TRPCError } from "@trpc/server";
import { and, count, eq, isNull } from "drizzle-orm";
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
import {
  getGroupInput,
  getManyByColumnInput,
  getManyInput,
} from "../lib/schemas";

/**
 * Relation map for cross-table filtering on listings.
 * Enables dot-notation property keys like "listingVariants.sku" in filters.
 */
const listingRelations: RelationMap = {
  listingVariants: {
    table: listingVariant,
    foreignKey: "listingId",
  },
};

export const listingRouter = router({
  update: orgProcedure
    .input(
      z.object({
        id: z.string(),
        // Info
        title: z.string().min(1).max(500).optional(),
        subTitle: z.string().max(500).nullable().optional(),
        description: z.string().max(100_000).nullable().optional(),
        descriptionHtml: z.string().max(500_000).nullable().optional(),
        brand: z.string().nullable().optional(),
        manufacturer: z.string().nullable().optional(),
        condition: z.string().min(1).optional(),
        conditionNote: z.string().nullable().optional(),
        duration: z.string().nullable().optional(),
        imageUrls: z.array(z.url()).max(30).nullable().optional(),
        marketplaceCategoryReference: z.string().nullable().optional(),
        // marketplace_category is keyed by (marketplaceId, siteId, reference).
        // Callers updating the reference must pass the site so the FK resolves
        // unambiguously on multi-site marketplaces (eBay US/UK/DE etc.).
        marketplaceCategorySiteId: z.string().nullable().optional(),
        // Offers
        offer: z.boolean().optional(),
        offerAcceptPrice: z.number().int().min(0).nullable().optional(),
        offerDeclinePrice: z.number().int().min(0).nullable().optional(),
        // Returns
        domesticReturn: z.boolean().optional(),
        domesticReturnWindow: z.number().int().min(0).nullable().optional(),
        domesticReturnPaidBy: z.string().nullable().optional(),
        internationalReturn: z.boolean().optional(),
        internationalReturnWindow: z
          .number()
          .int()
          .min(0)
          .nullable()
          .optional(),
        internationalReturnPaidBy: z.string().nullable().optional(),
        restockingFee: z.number().int().min(0).nullable().optional(),
        // Shipping
        localPickup: z.boolean().optional(),
        handlingTime: z.number().int().min(0).optional(),
        handlingFee: z.number().int().min(0).nullable().optional(),
        domesticShipping: z.boolean().optional(),
        domesticShippingType: z.string().nullable().optional(),
        domesticShippingBaseFee: z.number().int().min(0).nullable().optional(),
        domesticShippingAdditionalFee: z
          .number()
          .int()
          .min(0)
          .nullable()
          .optional(),
        internationalShipping: z.boolean().optional(),
        internationalShippingType: z.string().nullable().optional(),
        internationalShippingBaseFee: z
          .number()
          .int()
          .min(0)
          .nullable()
          .optional(),
        internationalShippingAdditionalFee: z
          .number()
          .int()
          .min(0)
          .nullable()
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        id,
        marketplaceCategoryReference,
        marketplaceCategorySiteId,
        ...patch
      } = input;

      // Resolve marketplace category reference -> UUID FK (single indexed lookup).
      // Done here rather than client-side because the picker emits the reference
      // (which it also uses for tree navigation), while the DB stores the UUID.
      let marketplaceCategoryId: string | null | undefined;
      if (marketplaceCategoryReference === null) {
        marketplaceCategoryId = null;
      } else if (marketplaceCategoryReference !== undefined) {
        const [row] = await db
          .select({ marketplaceId: channel.marketplaceId })
          .from(listing)
          .innerJoin(channel, eq(channel.id, listing.channelId))
          .where(
            and(
              eq(listing.id, id),
              eq(listing.organizationId, ctx.organizationId)
            )
          )
          .limit(1);

        if (!row) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found",
          });
        }

        // Match marketplace-category router semantics: null → site-less
        // categories, undefined → caller is on the unsafe legacy path.
        let sitePredicate: ReturnType<typeof eq> | undefined;
        if (marketplaceCategorySiteId === null) {
          sitePredicate = isNull(marketplaceCategory.siteId);
        } else if (marketplaceCategorySiteId !== undefined) {
          sitePredicate = eq(
            marketplaceCategory.siteId,
            marketplaceCategorySiteId
          );
        }

        const [resolved] = await db
          .select({ id: marketplaceCategory.id })
          .from(marketplaceCategory)
          .where(
            and(
              eq(marketplaceCategory.marketplaceId, row.marketplaceId),
              sitePredicate,
              eq(marketplaceCategory.reference, marketplaceCategoryReference)
            )
          )
          .limit(1);
        marketplaceCategoryId = resolved?.id ?? null;
      }

      const [updated] = await db
        .update(listing)
        .set({
          ...patch,
          ...(marketplaceCategoryId !== undefined && { marketplaceCategoryId }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(listing.id, id),
            eq(listing.organizationId, ctx.organizationId)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      return updated;
    }),

  getOne: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await db.query.listing.findFirst({
        where: and(
          eq(listing.id, input.id),
          eq(listing.organizationId, ctx.organizationId)
        ),
        with: {
          listingVariants: true,
          channel: true,
          product: true,
          marketplaceCategory: true,
        },
      });

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      return result;
    }),

  getNeighbors: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgWhere = eq(listing.organizationId, ctx.organizationId);
      const neighborSort = [
        { property: "createdAt", direction: "desc" } as const,
        { property: "id", direction: "desc" } as const,
      ];
      const prev = buildCursor(listing, {
        sort: neighborSort,
        cursor: input.id,
        direction: "backward",
      });
      const next = buildCursor(listing, {
        sort: neighborSort,
        cursor: input.id,
        direction: "forward",
      });

      const [prevRow, nextRow] = await Promise.all([
        db.query.listing.findFirst({
          where: and(orgWhere, prev.cursorWhere),
          orderBy: prev.orderBy,
          columns: { id: true },
        }),
        db.query.listing.findFirst({
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
    .input(
      getManyInput.extend({
        archived: z.boolean().default(false),
        channelId: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const {
        archived,
        channelId,
        cursor,
        limit,
        search,
        filter,
        sort,
        groupBy,
        rollups,
      } = input;

      const { after, before } = getCursorParams(cursor);

      // Scope to current org, archived state, and optional channel
      const orgWhere = eq(listing.organizationId, ctx.organizationId);
      const archivedWhere = eq(listing.archived, archived);
      const channelWhere = channelId
        ? eq(listing.channelId, channelId)
        : undefined;

      // Build WHERE from filters and search
      const filterWhere = buildWhere(
        listing,
        filter,
        listingRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchWhere = buildWhere(
        listing,
        searchQuery ? [searchQuery] : null,
        listingRelations
      );

      // Build group WHERE (for grouped views with row context)
      const groupWhere = groupBy
        ? (buildGroupWhere(listing, groupBy.type, groupBy.key) ?? undefined)
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
      const { orderBy, cursorWhere } = buildCursor(listing, {
        sort: sortWithTiebreaker,
        cursor: cursorId,
        direction,
      });

      const where = and(
        orgWhere,
        archivedWhere,
        channelWhere,
        filterWhere,
        searchWhere,
        cursorWhere,
        groupWhere
      );

      const extras =
        rollups.length > 0
          ? buildRollupExtras(listingRelations, rollups)
          : undefined;

      const items = await db.query.listing.findMany({
        where,
        orderBy,
        limit: limit + 1,
        extras,
        with: {
          listingVariants: true,
        },
      });

      const hasExtra = items.length > limit;
      if (hasExtra) {
        items.pop();
      }

      if (direction === "backward") {
        items.reverse();
      }

      flattenRelationArrays(items, ["listingVariants"]);

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
    .input(
      getManyByColumnInput.extend({
        archived: z.boolean().default(false),
        channelId: z.string().nullish(),
      })
    )
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Loop with cursor handling requires conditionals
    .query(async ({ ctx, input }) => {
      const {
        archived,
        channelId,
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

      // Scope to current org, archived state, and optional channel
      const orgWhere = eq(listing.organizationId, ctx.organizationId);
      const archivedWhere = eq(listing.archived, archived);
      const channelWhere = channelId
        ? eq(listing.channelId, channelId)
        : undefined;

      // Build common WHERE clauses
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchWhere = buildWhere(
        listing,
        searchQuery ? [searchQuery] : null,
        listingRelations
      );
      const filterWhere = buildWhere(
        listing,
        filter,
        listingRelations,
        rollups
      );

      // Build row-level group WHERE (for board views with row grouping)
      const rowGroupWhere = groupBy
        ? (buildGroupWhere(listing, groupBy.type, groupBy.key) ?? undefined)
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
        const groupByResult = buildGroupBy(listing, columnBy);

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
          .from(listing)
          .where(
            and(
              orgWhere,
              archivedWhere,
              channelWhere,
              filterWhere,
              searchWhere,
              rowGroupWhere
            )
          )
          .orderBy(orderBy);

        columnKeysToFetch = columnsResult.map((r) =>
          String(r.columnKey ?? `No ${columnBy.propertyId}`)
        );
      }

      // Fetch items for each column
      const allItems: (typeof listing.$inferSelect)[] = [];
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

        const columnWhere = buildGroupWhere(listing, columnBy, columnKey);

        if (!columnWhere) {
          continue;
        }

        const { orderBy, cursorWhere } = buildCursor(listing, {
          sort: sortWithTiebreaker,
          cursor,
          direction: "forward",
        });

        const data = await db.query.listing.findMany({
          where: and(
            orgWhere,
            archivedWhere,
            channelWhere,
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
              ? buildRollupExtras(listingRelations, rollups)
              : undefined,
          with: {
            listingVariants: true,
          },
        });

        flattenRelationArrays(data, ["listingVariants"]);
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
    .input(
      getGroupInput.extend({
        archived: z.boolean().default(false),
        channelId: z.string().nullish(),
      })
    )
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cursor + hideEmpty conditionals
    .query(async ({ ctx, input }) => {
      const {
        archived,
        channelId,
        filter,
        groupBy,
        hideEmpty,
        search,
        sort = "asc",
        limit,
        cursor,
        rollups,
      } = input;
      const groupByResult = buildGroupBy(listing, groupBy);
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

      // Scope to current org, archived state, and optional channel
      const orgWhere = eq(listing.organizationId, ctx.organizationId);
      const archivedWhere = eq(listing.archived, archived);
      const channelWhere = channelId
        ? eq(listing.channelId, channelId)
        : undefined;

      // Build filter/search conditions
      const filterCondition = buildWhere(
        listing,
        filter ?? undefined,
        listingRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchCondition = buildWhere(
        listing,
        searchQuery ? [searchQuery] : null,
        listingRelations
      );
      const whereCondition = and(
        orgWhere,
        archivedWhere,
        channelWhere,
        filterCondition,
        searchCondition
      );

      // Get paginated distinct values
      // When hideEmpty is true, apply whereCondition to exclude groups with no matching items
      const distinctQuery = db
        .selectDistinct({ groupKey, sortValue: orderBy })
        .from(listing);

      // Always scope to current org + archived state + channel for security;
      // when hideEmpty, also apply filter/search to exclude empty groups
      const distinctBase = hideEmpty
        ? whereCondition
        : and(orgWhere, archivedWhere, channelWhere);
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
        .from(listing)
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
