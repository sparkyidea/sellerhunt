/**
 * Upsert a single row into `scan_listing` keyed on `(marketplace, reference)`
 * and append a row to `scan_listing_snapshot` in the same transaction.
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
import { and, eq } from "drizzle-orm";

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

export async function upsertScanListing(
  input: UpsertScanListingInput
): Promise<{ id: string }> {
  const sellerId = input.sellerReference
    ? await resolveSellerId(input.marketplace, input.sellerReference)
    : null;

  const priceCents = input.price ?? null;
  const now = new Date();

  const baseFields = {
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
    const listingId = await upsertListingRow(tx, input, baseFields);

    await tx.insert(scanListingSnapshot).values({
      listingId,
      scannedAt: now,
      price: priceCents,
      itemSold: input.itemSold ?? null,
      soldLast24h: input.soldLast24h ?? null,
      soldLast30Days: input.soldLast30Days ?? null,
    });

    return { id: listingId };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function upsertListingRow(
  tx: Tx,
  input: UpsertScanListingInput,
  baseFields: Omit<typeof scanListing.$inferInsert, "marketplace" | "reference">
): Promise<string> {
  const [existing] = await tx
    .select({ id: scanListing.id })
    .from(scanListing)
    .where(
      and(
        eq(scanListing.marketplace, input.marketplace),
        eq(scanListing.reference, input.reference)
      )
    )
    .limit(1);

  if (existing) {
    await tx
      .update(scanListing)
      .set(baseFields)
      .where(eq(scanListing.id, existing.id));
    return existing.id;
  }

  const [inserted] = await tx
    .insert(scanListing)
    .values({
      marketplace: input.marketplace,
      reference: input.reference,
      ...baseFields,
    })
    .returning({ id: scanListing.id });
  if (!inserted) {
    throw new Error(
      `upsertScanListing: insert returned no row for ${input.marketplace}/${input.reference}`
    );
  }
  return inserted.id;
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
