import type { Database } from "@dashseller/db/client";
import {
  scanListingVariant,
  scanListingVariantSnapshot as snapshot,
} from "@dashseller/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, lt, lte, or } from "drizzle-orm";
import { z } from "zod";

export const variantHistoryInput = z
  .object({
    listingId: z.string().min(1),
    variantId: z.string().min(1),
    from: z.date().optional(),
    to: z.date().optional(),
    limit: z.number().int().min(1).max(500).default(100),
    cursor: z.object({ scannedAt: z.date(), id: z.string().min(1) }).nullish(),
  })
  .refine(
    (v) => !(v.from && v.to) || v.from <= v.to,
    "Invalid history date range"
  );

export function salesDelta(
  current: number | null,
  previous: number | null | undefined
) {
  return current !== null && previous != null && current >= previous
    ? current - previous
    : null;
}

export async function readVariantHistory(
  database: Database,
  input: z.infer<typeof variantHistoryInput>
) {
  const [variant] = await database
    .select({ id: scanListingVariant.id })
    .from(scanListingVariant)
    .where(
      and(
        eq(scanListingVariant.id, input.variantId),
        eq(scanListingVariant.listingId, input.listingId)
      )
    )
    .limit(1);
  if (!variant) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Variant does not belong to this listing",
    });
  }
  const cursor = input.cursor;
  const rows = await database
    .select()
    .from(snapshot)
    .where(
      and(
        eq(snapshot.variantId, input.variantId),
        input.from ? gte(snapshot.scannedAt, input.from) : undefined,
        input.to ? lte(snapshot.scannedAt, input.to) : undefined,
        cursor
          ? or(
              lt(snapshot.scannedAt, cursor.scannedAt),
              and(
                eq(snapshot.scannedAt, cursor.scannedAt),
                lt(snapshot.id, cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(snapshot.scannedAt), desc(snapshot.id))
    .limit(input.limit + 1);
  const items = rows.slice(0, input.limit).map((row, index) => ({
    ...row,
    salesDelta: salesDelta(row.itemSold, rows[index + 1]?.itemSold),
  }));
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > input.limit && last
        ? { scannedAt: last.scannedAt, id: last.id }
        : null,
  };
}
