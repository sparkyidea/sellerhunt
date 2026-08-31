import { db } from "@dashseller/db";
import { listing, listingVariant } from "@dashseller/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { orgProcedure, router } from "../index";
import { buildCursor } from "../lib/build-sort";

export const listingVariantRouter = router({
  getOne: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await db.query.listingVariant.findFirst({
        where: and(
          eq(listingVariant.id, input.id),
          eq(listingVariant.organizationId, ctx.organizationId)
        ),
        with: {
          listing: true,
          productVariant: true,
        },
      });

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing variant not found",
        });
      }

      return result;
    }),

  getNeighbors: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgWhere = eq(listingVariant.organizationId, ctx.organizationId);
      // Scope neighbors to the same parent listing as the current variant
      const sameListingWhere = sql`${listingVariant.listingId} = (SELECT ${listingVariant.listingId} FROM ${listingVariant} WHERE ${listingVariant.id} = ${input.id})`;
      const neighborSort = [
        { property: "createdAt", direction: "desc" } as const,
        { property: "id", direction: "desc" } as const,
      ];
      const prev = buildCursor(listingVariant, {
        sort: neighborSort,
        cursor: input.id,
        direction: "backward",
      });
      const next = buildCursor(listingVariant, {
        sort: neighborSort,
        cursor: input.id,
        direction: "forward",
      });

      const [prevRow, nextRow] = await Promise.all([
        db.query.listingVariant.findFirst({
          where: and(orgWhere, sameListingWhere, prev.cursorWhere),
          orderBy: prev.orderBy,
          columns: { id: true },
        }),
        db.query.listingVariant.findFirst({
          where: and(orgWhere, sameListingWhere, next.cursorWhere),
          orderBy: next.orderBy,
          columns: { id: true },
        }),
      ]);

      return {
        prevId: prevRow?.id ?? null,
        nextId: nextRow?.id ?? null,
      };
    }),

  update: orgProcedure
    .input(
      z.object({
        id: z.string(),
        price: z.number().int().min(0).optional(),
        quantity: z.number().int().min(0).optional(),
        imageUrls: z.array(z.url()).max(30).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;

      const existing = await db
        .select({ id: listingVariant.id, listingId: listingVariant.listingId })
        .from(listingVariant)
        .innerJoin(listing, eq(listing.id, listingVariant.listingId))
        .where(
          and(
            eq(listingVariant.id, id),
            eq(listing.organizationId, ctx.organizationId)
          )
        )
        .limit(1);

      if (!existing[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing variant not found",
        });
      }

      const [updated] = await db
        .update(listingVariant)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(listingVariant.id, id))
        .returning();

      return updated;
    }),
});
