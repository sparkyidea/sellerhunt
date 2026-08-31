import { db } from "@dashseller/db";
import { category } from "@dashseller/db/schema";
import { asc, eq, ilike, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

export const categoryRouter = router({
  /**
   * Get root-level categories (parentId is null) or children of a given parent.
   */
  getChildren: protectedProcedure
    .input(
      z.object({
        parentId: z.string().nullable().default(null),
      })
    )
    .query(async ({ input }) => {
      const where = input.parentId
        ? eq(category.parentId, input.parentId)
        : isNull(category.parentId);

      return await db
        .select({
          id: category.id,
          name: category.name,
          fullName: category.fullName,
          level: category.level,
          leaf: category.leaf,
          parentId: category.parentId,
        })
        .from(category)
        .where(where)
        .orderBy(asc(category.name));
    }),

  /**
   * Get a single category by ID (for displaying the current selection).
   */
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const result = await db.query.category.findFirst({
        where: eq(category.id, input.id),
        columns: {
          id: true,
          name: true,
          fullName: true,
          level: true,
          leaf: true,
          parentId: true,
        },
      });
      return result ?? null;
    }),

  /**
   * Search categories by name (for future search/filter functionality).
   */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const pattern = `%${input.query}%`;
      return await db
        .select({
          id: category.id,
          name: category.name,
          fullName: category.fullName,
          level: category.level,
          leaf: category.leaf,
          parentId: category.parentId,
        })
        .from(category)
        .where(ilike(category.fullName, pattern))
        .orderBy(asc(category.fullName))
        .limit(input.limit);
    }),
});
