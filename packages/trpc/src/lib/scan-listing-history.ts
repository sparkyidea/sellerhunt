import type { Database } from "@dashseller/db/client";
import {
  scanListing,
  scanListingSnapshot as snapshot,
} from "@dashseller/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt, lte, or } from "drizzle-orm";
import { z } from "zod";

export const listingHistoryInput = z
  .object({
    listingId: z.string().min(1),
    from: z.date().optional(),
    to: z.date().optional(),
    limit: z.number().int().min(1).max(500).default(100),
    cursor: z.object({ createdAt: z.date(), id: z.string().min(1) }).nullish(),
  })
  .refine(
    (v) => !(v.from && v.to) || v.from <= v.to,
    "Invalid history date range"
  );

/** Sales since the older snapshot; unknown or decreasing counters yield null. */
export function salesDelta(
  current: number | null,
  previous: number | null | undefined
) {
  return current !== null && previous != null && current >= previous
    ? current - previous
    : null;
}

/** Newest-first listing sales snapshots, paged by a createdAt/id cursor. */
export async function readListingHistory(
  database: Database,
  input: z.infer<typeof listingHistoryInput>
) {
  const [listing] = await database
    .select({ id: scanListing.id })
    .from(scanListing)
    .where(eq(scanListing.id, input.listingId))
    .limit(1);
  if (!listing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
  }
  const cursor = input.cursor;
  // The lower bound is applied after the query so the oldest returned
  // snapshot can still take its delta from the scan just before the bound.
  const rows = await database
    .select()
    .from(snapshot)
    .where(
      and(
        eq(snapshot.listingId, input.listingId),
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
      salesDelta: salesDelta(row.itemSold, rows[index + 1]?.itemSold),
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
