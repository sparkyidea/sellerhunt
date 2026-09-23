import type { Database } from "@dashseller/db/client";
import {
  scanListingVariant,
  scanListingVariantSnapshot as snapshot,
} from "@dashseller/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt, lte, or } from "drizzle-orm";
import { z } from "zod";

export const variantHistoryInput = z
  .object({
    variantId: z.string().min(1),
    from: z.date().optional(),
    to: z.date().optional(),
    limit: z.number().int().min(1).max(500).default(100),
    cursor: z.object({ createdAt: z.date(), id: z.string().min(1) }).nullish(),
  })
  .refine(
    (v) => !(v.from && v.to) || v.from <= v.to,
    "Invalid history date range"
  );

/**
 * Price movement since the older row, in cents. Negative on a price drop —
 * unlike sales counters, a price legitimately goes down. Null when either
 * side has no price.
 */
export function priceDelta(
  current: number | null,
  previous: number | null | undefined
) {
  return current !== null && previous != null ? current - previous : null;
}

/**
 * Newest-first price/stock history for one unit, paged by a createdAt/id
 * cursor.
 *
 * Rows are transitions, not scans: consecutive rows differ in price, currency
 * or status, and the gap between two rows is the span the earlier state held.
 */
export async function readVariantHistory(
  database: Database,
  input: z.infer<typeof variantHistoryInput>
) {
  const [variant] = await database
    .select({ id: scanListingVariant.id })
    .from(scanListingVariant)
    .where(eq(scanListingVariant.id, input.variantId))
    .limit(1);
  if (!variant) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Variant not found" });
  }
  const cursor = input.cursor;
  // The lower bound is applied after the query so the oldest returned row can
  // still take its delta from the change just before the bound.
  const rows = await database
    .select()
    .from(snapshot)
    .where(
      and(
        eq(snapshot.variantId, input.variantId),
        input.to ? lte(snapshot.createdAt, input.to) : undefined,
        cursor
          ? or(
              lt(snapshot.createdAt, cursor.createdAt),
              and(
                eq(snapshot.createdAt, cursor.createdAt),
                lt(snapshot.id, cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(snapshot.createdAt), desc(snapshot.id))
    .limit(input.limit + 1);
  const from = input.from;
  const below = from ? rows.findIndex((row) => row.createdAt < from) : -1;
  const inRange = below === -1 ? rows.length : below;
  const items = rows
    .slice(0, Math.min(input.limit, inRange))
    .map((row, index) => ({
      ...row,
      priceDelta: priceDelta(row.price, rows[index + 1]?.price),
    }));
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      inRange > input.limit && last
        ? { createdAt: last.createdAt, id: last.id }
        : null,
  };
}
