import { db } from "@dashseller/db";
import {
  scanListing,
  scanListingVariant,
  scanSeller,
} from "@dashseller/db/schema";
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
import { buildRollupExtras, flattenRelationArrays } from "../lib/build-rollup";
import { buildSearchFilter } from "../lib/build-search";
import { buildCursor } from "../lib/build-sort";
import { getGroupInput, getManyInput } from "../lib/schemas";

/**
 * Relation map for cross-table filtering on scan listings.
 * - `variants` is one-to-many: scan_listing_variant.listing_id = scan_listing.id
 * - `seller`   is many-to-one: scan_seller.id = scan_listing.seller_id
 *   (parentKey overrides the default "id" so the join uses listing.sellerId)
 */
const scanListingRelations: RelationMap = {
  variants: {
    table: scanListingVariant,
    foreignKey: "listingId",
  },
  seller: {
    table: scanSeller,
    foreignKey: "id",
    parentKey: "sellerId",
  },
};

export const scanListingRouter = router({
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const result = await db.query.scanListing.findFirst({
        where: eq(scanListing.id, input.id),
        with: {
          seller: true,
          variants: true,
        },
      });

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Scan listing not found",
        });
      }

      return result;
    }),

  getMany: publicProcedure
    .input(
      getManyInput.extend({
        marketplace: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const {
        cursor,
        limit,
        search,
        filter,
        sort,
        groupBy,
        rollups,
        marketplace,
      } = input;

      const { after, before } = getCursorParams(cursor);

      const marketplaceWhere = marketplace
        ? eq(scanListing.marketplace, marketplace)
        : undefined;

      const filterWhere = buildWhere(
        scanListing,
        filter,
        scanListingRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchWhere = buildWhere(
        scanListing,
        searchQuery ? [searchQuery] : null,
        scanListingRelations
      );

      const groupWhere = groupBy
        ? (buildGroupWhere(scanListing, groupBy.type, groupBy.key) ?? undefined)
        : undefined;

      const primaryDirection = sort[0]?.direction ?? "desc";
      const sortWithTiebreaker = [
        ...sort,
        { property: "id", direction: primaryDirection } as const,
      ];

      const direction = before ? "backward" : "forward";
      const cursorId = after ?? before;
      const { orderBy, cursorWhere } = buildCursor(scanListing, {
        sort: sortWithTiebreaker,
        cursor: cursorId,
        direction,
      });

      const where = and(
        marketplaceWhere,
        filterWhere,
        searchWhere,
        cursorWhere,
        groupWhere
      );

      const extras =
        rollups.length > 0
          ? buildRollupExtras(scanListingRelations, rollups)
          : undefined;

      const items = await db.query.scanListing.findMany({
        where,
        orderBy,
        limit: limit + 1,
        extras,
        with: {
          seller: true,
          variants: true,
        },
      });

      const hasExtra = items.length > limit;
      if (hasExtra) {
        items.pop();
      }

      if (direction === "backward") {
        items.reverse();
      }

      flattenRelationArrays(items, ["seller", "variants"]);

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

  getGroup: publicProcedure
    .input(
      getGroupInput.extend({
        marketplace: z.string().optional(),
      })
    )
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cursor + hideEmpty conditionals
    .query(async ({ input }) => {
      const {
        filter,
        groupBy,
        hideEmpty,
        search,
        sort = "asc",
        limit,
        cursor,
        rollups,
        marketplace,
      } = input;

      const groupByResult = buildGroupBy(scanListing, groupBy);
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

      const marketplaceWhere = marketplace
        ? eq(scanListing.marketplace, marketplace)
        : undefined;

      const filterCondition = buildWhere(
        scanListing,
        filter ?? undefined,
        scanListingRelations,
        rollups
      );
      const searchQuery = buildSearchFilter(
        search?.search ?? "",
        search?.searchFields ?? []
      );
      const searchCondition = buildWhere(
        scanListing,
        searchQuery ? [searchQuery] : null,
        scanListingRelations
      );
      const whereCondition = and(
        marketplaceWhere,
        filterCondition,
        searchCondition
      );

      const distinctQuery = db
        .selectDistinct({ groupKey, sortValue: orderBy })
        .from(scanListing);

      const distinctBase = hideEmpty ? whereCondition : marketplaceWhere;
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
        .from(scanListing)
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
