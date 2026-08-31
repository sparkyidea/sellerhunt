import { db } from "@dashseller/db";
import { marketplaceCategory } from "@dashseller/db/schema";
import { and, asc, eq, ilike, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

interface MarketplaceCategoryRow {
  fullName: string | null;
  leaf: boolean;
  name: string;
  parentReference: string | null;
  reference: string;
}

function computeLevel(row: MarketplaceCategoryRow): number {
  if (row.fullName) {
    return Math.max(0, row.fullName.split(" > ").length - 1);
  }
  return row.parentReference ? 1 : 0;
}

function toCategoryNode(row: MarketplaceCategoryRow) {
  return {
    id: row.reference,
    name: row.name,
    fullName: row.fullName ?? row.name,
    level: computeLevel(row),
    leaf: row.leaf,
    parentId: row.parentReference,
  };
}

export const marketplaceCategoryRouter = router({
  /**
   * Get root-level marketplace categories (parentReference is null) or
   * children of a given parent.
   */
  getChildren: protectedProcedure
    .input(
      z.object({
        marketplaceId: z.string(),
        siteId: z.string().nullable().default(null),
        parentReference: z.string().nullable().default(null),
      })
    )
    .query(async ({ input }) => {
      const rows = await db
        .select({
          reference: marketplaceCategory.reference,
          name: marketplaceCategory.name,
          fullName: marketplaceCategory.fullName,
          parentReference: marketplaceCategory.parentReference,
          leaf: marketplaceCategory.leaf,
        })
        .from(marketplaceCategory)
        .where(
          and(
            eq(marketplaceCategory.marketplaceId, input.marketplaceId),
            input.siteId
              ? eq(marketplaceCategory.siteId, input.siteId)
              : undefined,
            input.parentReference
              ? eq(marketplaceCategory.parentReference, input.parentReference)
              : isNull(marketplaceCategory.parentReference)
          )
        )
        .orderBy(asc(marketplaceCategory.name));

      return rows.map(toCategoryNode);
    }),

  /**
   * Get a single marketplace category by (marketplaceId, siteId, reference)
   * for displaying the current selection / breadcrumb back header.
   */
  getOne: protectedProcedure
    .input(
      z.object({
        marketplaceId: z.string(),
        siteId: z.string().nullable().default(null),
        reference: z.string(),
      })
    )
    .query(async ({ input }) => {
      const row = await db.query.marketplaceCategory.findFirst({
        where: and(
          eq(marketplaceCategory.marketplaceId, input.marketplaceId),
          input.siteId
            ? eq(marketplaceCategory.siteId, input.siteId)
            : undefined,
          eq(marketplaceCategory.reference, input.reference)
        ),
        columns: {
          reference: true,
          name: true,
          fullName: true,
          parentReference: true,
          leaf: true,
        },
      });
      return row ? toCategoryNode(row) : null;
    }),

  /**
   * Search marketplace categories by name.
   */
  search: protectedProcedure
    .input(
      z.object({
        marketplaceId: z.string(),
        siteId: z.string().nullable().default(null),
        query: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const pattern = `%${input.query}%`;
      const rows = await db
        .select({
          reference: marketplaceCategory.reference,
          name: marketplaceCategory.name,
          fullName: marketplaceCategory.fullName,
          parentReference: marketplaceCategory.parentReference,
          leaf: marketplaceCategory.leaf,
        })
        .from(marketplaceCategory)
        .where(
          and(
            eq(marketplaceCategory.marketplaceId, input.marketplaceId),
            input.siteId
              ? eq(marketplaceCategory.siteId, input.siteId)
              : undefined,
            ilike(marketplaceCategory.fullName, pattern)
          )
        )
        .orderBy(asc(marketplaceCategory.fullName))
        .limit(input.limit);

      return rows.map(toCategoryNode);
    }),
});
