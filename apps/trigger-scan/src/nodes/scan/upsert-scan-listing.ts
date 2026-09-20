import type { Database } from "@dashseller/db/client";
import {
  scanListing,
  scanListingSnapshot,
  scanListingVariant,
  scanSeller,
} from "@dashseller/db/schema";
import { validateListingObservation } from "@dashseller/marketplace-scan/listing-observation";
import type { ScanListing } from "@dashseller/marketplace-scan/types";
import { and, eq, notInArray, sql } from "drizzle-orm";

/** Save a completed full scan, its current variants and listing sales together. */
export async function upsertScanListing(
  database: Database,
  input: ScanListing,
  fit: boolean
) {
  validateListingObservation(input);
  return await database.transaction(async (tx) => {
    const inserted = fit
      ? await tx
          .insert(scanListing)
          .values({
            marketplace: input.marketplace,
            reference: input.reference,
            title: input.title,
          })
          .onConflictDoNothing({
            target: [scanListing.marketplace, scanListing.reference],
          })
          .returning({ id: scanListing.id })
      : [];
    const [current] = await tx
      .select({
        id: scanListing.id,
      })
      .from(scanListing)
      .where(
        and(
          eq(scanListing.marketplace, input.marketplace),
          eq(scanListing.reference, input.reference)
        )
      )
      .for("update");
    if (!current) {
      return { id: null, isNew: false };
    }
    const isNew = inserted.length === 1;
    const savedAt = new Date();
    const seller = input.sellerReference
      ? await tx
          .select({ id: scanSeller.id })
          .from(scanSeller)
          .where(
            and(
              eq(scanSeller.marketplace, input.marketplace),
              eq(scanSeller.reference, input.sellerReference)
            )
          )
          .limit(1)
      : [];
    const observedIds: string[] = [];
    for (let offset = 0; offset < input.variants.length; offset += 500) {
      const batch = input.variants.slice(offset, offset + 500);
      const rows = await tx
        .insert(scanListingVariant)
        .values(
          batch.map((v) => ({
            ...v,
            listingId: current.id,
            createdAt: savedAt,
            updatedAt: savedAt,
          }))
        )
        .onConflictDoUpdate({
          target: [scanListingVariant.listingId, scanListingVariant.reference],
          set: {
            sku: sql`excluded.sku`,
            attributes: sql`excluded.attributes`,
            imageUrls: sql`excluded.image_urls`,
            price: sql`excluded.price`,
            currency: sql`excluded.currency`,
            status: sql`excluded.status`,
            updatedAt: savedAt,
          },
        })
        .returning({
          id: scanListingVariant.id,
        });
      for (const row of rows) {
        observedIds.push(row.id);
      }
    }
    await tx
      .update(scanListingVariant)
      .set({ status: "removed", updatedAt: savedAt })
      .where(
        and(
          eq(scanListingVariant.listingId, current.id),
          sql`${scanListingVariant.status} IS DISTINCT FROM 'removed'`,
          notInArray(scanListingVariant.id, observedIds)
        )
      );
    const {
      variants: _variants,
      sellerReference: _sellerReference,
      ...details
    } = input;
    await tx
      .update(scanListing)
      .set({
        ...details,
        sellerId: seller[0]?.id ?? null,
        lastScannedAt: savedAt,
      })
      .where(eq(scanListing.id, current.id));
    await tx.insert(scanListingSnapshot).values({
      listingId: current.id,
      itemSold: input.itemSold,
      soldLast24h: input.soldLast24h,
      soldLast30Days: input.soldLast30Days,
      createdAt: savedAt,
    });
    return { id: current.id, isNew };
  });
}
