/**
 * Upsert a single row into `scan_listing` keyed on `(marketplace, reference)`
 * and append a row to `scan_listing_snapshot` in the same transaction.
 *
 * One `INSERT … ON CONFLICT DO UPDATE`, so two leaves persisting the same
 * listing at once (the keyword path, the seller path and the cron
 * orphan-catch can overlap) cannot race the way a select-then-insert did.
 * `RETURNING (xmax = 0)` tells the caller whether this call created the row
 * (`isNew`), which is what gates keyword extraction: a listing goes to the
 * inline LLM on its first qualifying insert. Promoted/existing rows use catch-up.
 * The keyword columns
 * (`keyword_id`, `keyword_attempts`) are deliberately not in the update set,
 * so rescans preserve them.
 *
 * The snapshot is the velocity timeseries — every detail fetch records an
 * append-only point so we can compute item-sold deltas over time even when
 * eBay doesn't surface a 24h hotness signal. Listing-level denormalized
 * columns on `scan_listing` carry the latest values for fast queries.
 *
 * Money is stored as integer cents.
 */
import { db } from "@dashseller/db";
import {
  scanListing,
  scanListingSnapshot,
  scanSeller,
} from "@dashseller/db/schema";
import { and, eq, sql } from "drizzle-orm";

export interface UpsertScanListingInput {
  categoryPath?: string[] | null;
  condition?: string | null;
  currency?: string | null;
  description?: string | null;
  endedAt?: Date | null;
  goodTillCancelled?: boolean | null;
  imageUrls?: string[] | null;
  itemSold?: number | null;
  marketplace: string;
  marketplaceCategoryReference?: string | null;
  /** Display price in **integer cents** (mapper-converted). Stored as-is. */
  price?: number | null;
  qualified: boolean;
  reference: string;
  /**
   * eBay seller username (or marketplace equivalent). Resolved to
   * `scan_seller.id` via a lookup; null if no row exists.
   */
  sellerReference?: string | null;
  /** eBay-only: sparse 24h hotness signal. */
  soldLast24h?: number | null;
  /** Shopify-only: 30-day approximate sold count. */
  soldLast30Days?: number | null;
  startedAt?: Date | null;
  title: string;
  url?: string | null;
  /** True when the listing has multiple variations (drives variant fan-out). */
  variant?: boolean;
}

export interface UpsertScanListingResult {
  id: string;
  /** True when this call inserted the row — first time this listing was seen. */
  isNew: boolean;
}

export async function upsertScanListing(
  input: UpsertScanListingInput
): Promise<UpsertScanListingResult> {
  const sellerId = input.sellerReference
    ? await resolveSellerId(input.marketplace, input.sellerReference)
    : null;

  const priceCents = input.price ?? null;
  const now = new Date();

  // Everything a rescan may overwrite. `keyword_id` / `keyword_attempts` are
  // absent on purpose; `updated_at` is applied by the schema's $onUpdate.
  const baseFields = {
    qualified: input.qualified,
    sellerId,
    title: input.title,
    description: input.description ?? null,
    condition: input.condition ?? null,
    marketplaceCategoryReference: input.marketplaceCategoryReference ?? null,
    categoryPath: input.categoryPath ?? null,
    imageUrls: input.imageUrls ?? null,
    url: input.url ?? null,
    variant: input.variant ?? false,
    goodTillCancelled: input.goodTillCancelled ?? null,
    startedAt: input.startedAt ?? null,
    endedAt: input.endedAt ?? null,
    price: priceCents,
    currency: input.currency ?? null,
    itemSold: input.itemSold ?? null,
    soldLast24h: input.soldLast24h ?? null,
    soldLast30Days: input.soldLast30Days ?? null,
    lastScannedAt: now,
  };

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(scanListing)
      .values({
        marketplace: input.marketplace,
        reference: input.reference,
        ...baseFields,
      })
      .onConflictDoUpdate({
        target: [scanListing.marketplace, scanListing.reference],
        set: baseFields,
      })
      // xmax is 0 on a freshly inserted tuple and non-zero on an updated one.
      .returning({ id: scanListing.id, isNew: sql<boolean>`(xmax = 0)` });
    if (!row) {
      throw new Error(
        `upsertScanListing: upsert returned no row for ${input.marketplace}/${input.reference}`
      );
    }

    await tx.insert(scanListingSnapshot).values({
      listingId: row.id,
      scannedAt: now,
      price: priceCents,
      itemSold: input.itemSold ?? null,
      soldLast24h: input.soldLast24h ?? null,
      soldLast30Days: input.soldLast30Days ?? null,
    });

    return { id: row.id, isNew: row.isNew };
  });
}

async function resolveSellerId(
  marketplace: string,
  reference: string
): Promise<string | null> {
  const [row] = await db
    .select({ id: scanSeller.id })
    .from(scanSeller)
    .where(
      and(
        eq(scanSeller.marketplace, marketplace),
        eq(scanSeller.reference, reference)
      )
    )
    .limit(1);
  return row?.id ?? null;
}
