import type { Database } from "@dashseller/db/client";
import {
  scanListing,
  scanListingSnapshot,
  scanListingVariant,
  scanListingVariantSnapshot,
  scanSeller,
} from "@dashseller/db/schema";
import { validateListingObservation } from "@dashseller/marketplace-scan/listing-observation";
import type { ScanListing } from "@dashseller/marketplace-scan/types";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The state a variant was left in by this scan — the candidate history row. */
interface VariantState {
  currency: string | null;
  id: string;
  price: number | null;
  status: "in_stock" | "out_of_stock" | "removed";
}

/** Rows per statement, for both the variant upsert and the history lookups. */
const CHUNK = 500;

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
    const observed: VariantState[] = [];
    for (let offset = 0; offset < input.variants.length; offset += CHUNK) {
      const batch = input.variants.slice(offset, offset + CHUNK);
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
            model: sql`excluded.model`,
            mpn: sql`excluded.mpn`,
            upc: sql`excluded.upc`,
            ean: sql`excluded.ean`,
            isbn: sql`excluded.isbn`,
            gtin: sql`excluded.gtin`,
            status: sql`excluded.status`,
            updatedAt: savedAt,
          },
        })
        .returning({
          id: scanListingVariant.id,
          price: scanListingVariant.price,
          currency: scanListingVariant.currency,
          status: scanListingVariant.status,
        });
      observed.push(...rows);
    }
    // Units the scan no longer saw. Their removal is a state change like any
    // other, so they go through the same history path below.
    const removed = await tx
      .update(scanListingVariant)
      .set({ status: "removed", updatedAt: savedAt })
      .where(
        and(
          eq(scanListingVariant.listingId, current.id),
          sql`${scanListingVariant.status} IS DISTINCT FROM 'removed'`,
          notInArray(
            scanListingVariant.id,
            observed.map((v) => v.id)
          )
        )
      )
      .returning({
        id: scanListingVariant.id,
        price: scanListingVariant.price,
        currency: scanListingVariant.currency,
        status: scanListingVariant.status,
      });
    await appendVariantHistory(tx, [...observed, ...removed], savedAt);
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
    await appendListingHistory(tx, current.id, input, savedAt);
    return { id: current.id, isNew };
  });
}

/**
 * Write a history row for each unit whose price, currency or stock state
 * differs from the newest row it already has. A unit observed at the state it
 * was last recorded in writes nothing, so history stays a log of changes
 * rather than a log of scans.
 */
async function appendVariantHistory(
  tx: Transaction,
  states: VariantState[],
  savedAt: Date
) {
  if (states.length === 0) {
    return;
  }
  const latest = new Map<string, VariantState>();
  for (let offset = 0; offset < states.length; offset += CHUNK) {
    const ids = states.slice(offset, offset + CHUNK).map((v) => v.id);
    const rows = await tx
      .selectDistinctOn([scanListingVariantSnapshot.variantId], {
        id: scanListingVariantSnapshot.variantId,
        price: scanListingVariantSnapshot.price,
        currency: scanListingVariantSnapshot.currency,
        status: scanListingVariantSnapshot.status,
      })
      .from(scanListingVariantSnapshot)
      .where(inArray(scanListingVariantSnapshot.variantId, ids))
      .orderBy(
        scanListingVariantSnapshot.variantId,
        desc(scanListingVariantSnapshot.createdAt),
        desc(scanListingVariantSnapshot.id)
      );
    for (const row of rows) {
      latest.set(row.id, row);
    }
  }
  const changed = states.filter((state) => {
    const previous = latest.get(state.id);
    return (
      !previous ||
      previous.price !== state.price ||
      previous.currency !== state.currency ||
      previous.status !== state.status
    );
  });
  for (let offset = 0; offset < changed.length; offset += CHUNK) {
    await tx.insert(scanListingVariantSnapshot).values(
      changed.slice(offset, offset + CHUNK).map((state) => ({
        variantId: state.id,
        price: state.price,
        currency: state.currency,
        status: state.status,
        createdAt: savedAt,
      }))
    );
  }
}

/**
 * Write a listing sales row only when a counter moved. Same rule as the
 * variant history: a scan that measures what was already recorded adds
 * nothing, and `scan_listing.last_scanned_at` remains the record of when the
 * listing was actually looked at.
 */
async function appendListingHistory(
  tx: Transaction,
  listingId: string,
  input: ScanListing,
  savedAt: Date
) {
  const [previous] = await tx
    .select({
      itemSold: scanListingSnapshot.itemSold,
      soldLast24h: scanListingSnapshot.soldLast24h,
      soldLast30Days: scanListingSnapshot.soldLast30Days,
    })
    .from(scanListingSnapshot)
    .where(eq(scanListingSnapshot.listingId, listingId))
    .orderBy(desc(scanListingSnapshot.createdAt), desc(scanListingSnapshot.id))
    .limit(1);
  if (
    previous &&
    previous.itemSold === input.itemSold &&
    previous.soldLast24h === input.soldLast24h &&
    previous.soldLast30Days === input.soldLast30Days
  ) {
    return;
  }
  await tx.insert(scanListingSnapshot).values({
    listingId,
    itemSold: input.itemSold,
    soldLast24h: input.soldLast24h,
    soldLast30Days: input.soldLast30Days,
    createdAt: savedAt,
  });
}
